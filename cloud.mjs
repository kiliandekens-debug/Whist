const endpoint = "/api/whist-state";
// Longer than the server-side proxy timeout, so a slow write is never abandoned midway.
const timeout = 15000;

export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function failure(code) {
  return Object.assign(Error("Cloud " + code), {code});
}

async function request(options, authorize) {
  const headers = new Headers(options?.headers);
  if (authorize) headers.set("Authorization", "Bearer " + await authorize());
  const response = await fetch(endpoint, {
    ...options,
    headers,
    cache:"no-store",
    signal:AbortSignal.timeout(timeout),
  });
  if (response.status === 401 || response.status === 403) throw failure("session");
  if (response.status === 413) throw failure("size");
  return response;
}

export function createCloudStore({read, write, report, hasLocal, revision, dirty, authorize}) {
  let onlineRevision = null;
  let busy = false;
  let changes = 0;
  let conflict = false;
  // Snapshots sent without receiving an answer: the server may have stored any of them.
  let unconfirmed = [];

  function mark(snapshot) {
    write(snapshot, {revision,dirty});
  }

  function explain(error) {
    if (error?.code === "session") report("Ta session a expiré. Recharge la page pour te reconnecter.", "retry");
    else if (error?.code === "size") report("Le carnet est trop volumineux pour être sauvegardé en ligne.", "retry");
    else report("Hors connexion. Le carnet est gardé sur cet appareil.", "retry");
  }

  async function fetchRemote() {
    const response = await request(undefined, authorize);
    if (!response.ok) throw failure("read");
    return response.json();
  }

  async function flush() {
    if (busy || conflict || onlineRevision === null || !dirty) return;
    busy = true;
    report("On sauvegarde…");
    try {
      while (dirty) {
        const sent = changes;
        const snapshot = JSON.stringify(read());
        unconfirmed.push(snapshot);
        if (unconfirmed.length > 3) unconfirmed.shift();
        const response = await request({
          method:"PUT",
          headers:{"Content-Type":"application/json"},
          body:'{"revision":' + onlineRevision + ',"snapshot":' + snapshot + "}",
        }, authorize);
        if (response.status === 409) {
          // A write whose answer was lost looks like a conflict. Compare before asking.
          const remote = await fetchRemote();
          const stored = remote.snapshot ? canonical(remote.snapshot) : null;
          const mine = unconfirmed.some(item => canonical(JSON.parse(item)) === stored);
          unconfirmed = [];
          if (mine) {
            revision = onlineRevision = remote.revision;
            dirty = changes !== sent || canonical(JSON.parse(snapshot)) !== stored;
            mark(read());
            continue;
          }
          conflict = true;
          report("Deux versions à comparer", "resolve");
          return;
        }
        if (!response.ok) throw failure("write");
        const updated = await response.json();
        unconfirmed = [];
        revision = onlineRevision = updated.revision;
        dirty = changes !== sent;
        mark(read());
      }
      report("Tout est sauvegardé");
    } catch (error) {
      explain(error);
    } finally {
      busy = false;
    }
  }

  async function load({replace = false, remote = null} = {}) {
    if (busy) return;
    busy = true;
    report("On vérifie le carnet…");
    try {
      remote ??= await fetchRemote();
      const local = read();
      const same = !!remote.snapshot && canonical(local) === canonical(remote.snapshot);
      if (!replace && remote.snapshot && (dirty || (revision === null && hasLocal(local))) &&
          revision !== remote.revision && !same) {
        conflict = true;
        report("Deux versions à comparer", "resolve");
        return;
      }
      onlineRevision = revision = remote.revision;
      conflict = false;
      if (same) {
        dirty = false;
        mark(local);
      } else if (remote.snapshot && (replace || !dirty)) {
        dirty = false;
        mark(remote.snapshot);
      } else {
        dirty ||= hasLocal(local);
        mark(local);
      }
      report("Ton carnet est à jour");
    } catch (error) {
      explain(error);
      return;
    } finally {
      busy = false;
    }
    await flush();
  }

  // Resolve a conflict by publishing this device's notebook over the online one.
  async function keepLocal() {
    if (busy) return;
    busy = true;
    report("On sauvegarde…");
    try {
      const remote = await fetchRemote();
      onlineRevision = revision = remote.revision;
      conflict = false;
      dirty = true;
      mark(read());
    } catch (error) {
      explain(error);
      return;
    } finally {
      busy = false;
    }
    await flush();
  }

  return {
    load,
    keepLocal,
    pending:() => dirty,
    conflicted:() => conflict,
    save() {
      changes++;
      dirty = true;
      mark(read());
      // Without a known online revision the first load never succeeded, so try it again.
      if (onlineRevision === null) void load();
      else void flush();
    },
  };
}
