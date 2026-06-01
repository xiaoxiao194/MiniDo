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
    const batch = 100;
    let skip = 0;
    let all = [];
    while (true) {
      const result = await db.collection('tasks').where({ openid }).skip(skip).limit(batch).get();
      const data = result.data || [];
      all = all.concat(data);
      if (data.length < batch) {
        break;
      }
      skip += batch;
    }
    const merged = storage.mergeRemoteTasks(all);
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
    try {
      await cleanupDeletedTasks();
    } catch (cleanupError) {
      // 清理失败不影响同步结果
    }
    return { ok: true, tasks: storage.getTasks() };
  } catch (error) {
    return { ok: false, reason: error.message || 'sync_failed', tasks: storage.getTasks() };
  }
}

async function cleanupDeletedTasks(now = new Date()) {
  const cutoff = now.getTime() - 30 * 86400000;
  const tasks = storage.getTasks();
  const stale = tasks.filter((task) => task.deletedAt && new Date(task.deletedAt).getTime() < cutoff);
  if (!stale.length) {
    return;
  }
  if (wx.cloud) {
    const db = wx.cloud.database();
    for (const task of stale) {
      try {
        await db.collection('tasks').doc(task.id).remove();
      } catch (error) {
        // 单个删除失败不中断整体清理
      }
    }
  }
  const staleIds = new Set(stale.map((task) => task.id));
  storage.saveTasks(tasks.filter((task) => !staleIds.has(task.id)));
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
  syncAll,
  cleanupDeletedTasks
};
