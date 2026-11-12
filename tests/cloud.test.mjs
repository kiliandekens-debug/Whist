import test from "node:test";
import assert from "node:assert/strict";
import {createCloudStore} from "../cloud.mjs";

// A stand-in for the storage API: one record guarded by its revision.
function server(record = {revision:0, snapshot:null}) {
  const api = {record, offline:false, dropAnswers:0, status:null, puts:0};
  globalThis.fetch = async (_url, options = {}) => {
    if (api.offline) throw TypeError("network");
    if (api.status) return new Response("{}", {status:api.status});
    if (options.method !== "PUT") return Response.json(api.record);
    api.puts++;
    const {revision, snapshot} = JSON.parse(options.body);
    if (revision !== api.record.revision) return Response.json({error:"conflict"}, {status:409});
    api.record = {revision:revision + 1, snapshot};
    if (api.dropAnswers-- > 0) throw TypeError("answer lost");
    return Response.json({revision:api.record.revision});
  };
  return api;
}

function device(state, meta = {}) {
  const local = {state, reports:[]};
  local.store = createCloudStore({
    read:() => local.state,
    write(snapshot, saved) { local.state = snapshot; local.meta = saved; },
    report(message, action) { local.reports.push(action ?? "ok"); local.message = message; },
    hasLocal:value => value.history.length > 0,
    revision:meta.revision ?? null,
    dirty:meta.dirty === true,
  });
  return local;
}
const settle = () => new Promise(resolve => setTimeout(resolve, 20));
const game = name => ({history:[name], groups:[]});

test("a new device takes the online notebook", async () => {
  server({revision:3, snapshot:game("online")});
  const local = device({history:[], groups:[]});
  await local.store.load();
  assert.deepEqual(local.state, game("online"));
  assert.deepEqual(local.meta, {revision:3, dirty:false});
});

test("changes are sent and the revision follows", async () => {
  const api = server();
  const local = device({history:[], groups:[]});
  await local.store.load();
  local.state = game("first");
  local.store.save();
  await settle();
  assert.deepEqual(api.record, {revision:1, snapshot:game("first")});
  assert.deepEqual(local.meta, {revision:1, dirty:false});
});

test("a write whose answer was lost is not reported as a conflict", async () => {
  const api = server();
  const local = device({history:[], groups:[]});
  await local.store.load();
  api.dropAnswers = 1;
  local.state = game("first");
  local.store.save();
  await settle();
  assert.equal(local.meta.dirty, true);
  local.state = game("second");
  local.store.save();
  await settle();
  assert.equal(local.store.conflicted(), false);
  assert.deepEqual(api.record.snapshot, game("second"));
  assert.equal(local.meta.dirty, false);
});

test("saving after an offline start retries the first load", async () => {
  const api = server({revision:2, snapshot:game("mine")});
  api.offline = true;
  const local = device(game("mine"), {revision:2});
  await local.store.load();
  assert.equal(local.reports.at(-1), "retry");
  api.offline = false;
  local.state = game("mine, edited");
  local.store.save();
  await settle();
  assert.deepEqual(api.record, {revision:3, snapshot:game("mine, edited")});
});

test("a real conflict can keep either version", async () => {
  const api = server({revision:5, snapshot:game("other device")});
  const local = device(game("this device"), {revision:4, dirty:true});
  await local.store.load();
  assert.equal(local.store.conflicted(), true);
  assert.equal(local.reports.at(-1), "resolve");
  await local.store.keepLocal();
  assert.deepEqual(api.record, {revision:6, snapshot:game("this device")});
  assert.equal(local.store.conflicted(), false);

  api.record = {revision:9, snapshot:game("other device")};
  const second = device(game("this device"), {revision:4, dirty:true});
  await second.store.load();
  await second.store.load({replace:true});
  assert.deepEqual(second.state, game("other device"));
  assert.equal(second.store.pending(), false);
});

test("an expired session is not reported as being offline", async () => {
  const api = server();
  api.status = 401;
  const local = device({history:[], groups:[]});
  await local.store.load();
  assert.match(local.message, /session a expiré/);
});
