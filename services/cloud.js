const storage = require('./storage');

async function getOpenId() {
  if (!wx.cloud) {
    return '';
  }
  try {
    const result = await wx.cloud.callFunction({ name: 'login' });
    return result.result.openid || '';
  } catch (error) {
    return '';
  }
}

async function syncTask(task) {
  if (!wx.cloud) {
    return { ok: false, reason: 'cloud_unavailable' };
  }
  const target = { ...task };
  if (!target.openid) {
    target.openid = await getOpenId();
    if (target.openid) {
      storage.updateTask(target.id, { openid: target.openid });
    }
  }
  if (!target.openid) {
    return { ok: false, reason: 'openid_unavailable' };
  }
  try {
    const db = wx.cloud.database();
    await db.collection('tasks').doc(target.id).set({ data: target });
    storage.updateTask(target.id, { syncStatus: 'synced' });
    return { ok: true };
  } catch (error) {
    storage.updateTask(target.id, { syncStatus: 'failed' });
    return { ok: false, reason: error.message || 'sync_failed' };
  }
}

async function pullTasks(openid) {
  if (!wx.cloud || !openid) {
    return [];
  }
  try {
    const db = wx.cloud.database();
    const result = await db.collection('tasks').where({ openid }).get();
    const merged = storage.mergeRemoteTasks(result.data || []);
    await uploadTasks(merged.toUpload.map((task) => ({ ...task, openid })));
    return merged.merged;
  } catch (error) {
    return storage.getTasks();
  }
}

async function syncAll() {
  const openid = await getOpenId();
  if (!openid) {
    return { ok: false, reason: 'openid_unavailable', tasks: storage.getTasks() };
  }
  try {
    const tasks = await pullTasks(openid);
    return { ok: true, tasks };
  } catch (error) {
    return { ok: false, reason: error.message || 'sync_failed', tasks: storage.getTasks() };
  }
}

async function uploadTasks(tasks) {
  if (!wx.cloud || !tasks.length) {
    return;
  }
  const db = wx.cloud.database();
  for (const task of tasks) {
    await db.collection('tasks').doc(task.id).set({ data: task });
    storage.updateTask(task.id, { syncStatus: 'synced', openid: task.openid });
  }
}

module.exports = {
  getOpenId,
  syncTask,
  pullTasks,
  syncAll
};
