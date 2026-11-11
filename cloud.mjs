const endpoint = "/api/whist-state";

function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

async function request(options, authorize) {
  const headers = new Headers(options?.headers);
  if (authorize) headers.set("Authorization", "Bearer " + await authorize());
  return fetch(endpoint, {
    ...options,
    headers,
    cache:"no-store",
    signal:AbortSignal.timeout(6000),
  });
}

export function createCloudStore({read, write, report, hasLocal, revision, dirty, authorize}) {
  let onlineRevision = null;
  let busy = false;
  let changes = 0;
  let conflict = false;

  function mark(snapshot) {
    write(snapshot, {revision,dirty});
  }

  async function flush() {
    if (busy || conflict || onlineRevision === null || !dirty) return;
    busy = true;
    report("On sauvegarde…");
    try {
      while (dirty) {
        const sent = changes;
        const response = await request({
          method:"PUT",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({revision:onlineRevision,snapshot:read()}),
        }, authorize);
        if (response.status === 409) {
          conflict = true;
          report("Deux versions à comparer", "resolve");
          return;
        }
        if (!response.ok) throw Error("Cloud write failed");
        const updated = await response.json();
        revision = onlineRevision = updated.revision;
        dirty = changes !== sent;
        mark(read());
      }
      report("Tout est sauvegardé");
    } catch {
      report("Hors connexion. Le carnet est gardé sur cet appareil.", "retry");
    } finally {
      busy = false;
    }
  }

  async function load({replace = false} = {}) {
    if (busy) return;
    busy = true;
    report("On sauvegarde…");
    try {
      const response = await request(undefined, authorize);
      if (!response.ok) throw Error("Cloud read failed");
      const remote = await response.json();
      const local = read();
      if (!replace && remote.snapshot && (dirty || (revision === null && hasLocal(local))) &&
          revision !== remote.revision && canonical(local) !== canonical(remote.snapshot)) {
        conflict = true;
        report("Deux versions à comparer", "resolve");
        return;
      }
      onlineRevision = revision = remote.revision;
      conflict = false;
      if (remote.snapshot && (replace || !dirty || canonical(local) === canonical(remote.snapshot))) {
        dirty = false;
        mark(remote.snapshot);
      } else {
        dirty ||= hasLocal(local);
        mark(local);
      }
      report("Ton carnet est à jour");
    } catch {
      report("Hors connexion. Le carnet est gardé sur cet appareil.", "retry");
      return;
    } finally {
      busy = false;
    }
    await flush();
  }

  return {
    load,
    save() {
      changes++;
      dirty = true;
      mark(read());
      void flush();
    },
  };
}
