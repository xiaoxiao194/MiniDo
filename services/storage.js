const { mergeTaskCollections } = require('../utils/taskCore');

const STORAGE_KEY = 'MINIDO_TASKS_V1';
const TAGS_KEY = 'MINIDO_TAGS_V1';
const SETTINGS_KEY = 'MINIDO_SETTINGS_V1';
const PRIVACY_KEY = 'MINIDO_PRIVACY_ACCEPTED_V1';

function getTasks() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || [];
  } catch (error) {
    return [];
  }
}

function saveTasks(tasks) {
  wx.setStorageSync(STORAGE_KEY, tasks);
  return tasks;
}

function upsertTask(task) {
  const tasks = getTasks();
  const index = tasks.findIndex((item) => item.id === task.id);
  if (index === -1) {
    tasks.unshift(task);
  } else {
    tasks[index] = { ...tasks[index], ...task };
  }
  return saveTasks(tasks);
}

function updateTask(id, patch) {
  const tasks = getTasks();
  const index = tasks.findIndex((task) => task.id === id);
  if (index === -1) {
    return null;
  }
  const updated = {
    ...tasks[index],
    ...patch,
    updatedAt: patch.updatedAt || new Date().toISOString(),
    syncStatus: patch.syncStatus || 'pending'
  };
  tasks[index] = updated;
  saveTasks(tasks);
  return updated;
}

function mergeRemoteTasks(remoteTasks) {
  const result = mergeTaskCollections(getTasks(), remoteTasks || []);
  saveTasks(result.merged);
  return result;
}

function getTags() {
  try {
    return wx.getStorageSync(TAGS_KEY) || [];
  } catch (error) {
    return [];
  }
}

function saveTags(tags) {
  wx.setStorageSync(TAGS_KEY, tags);
  return tags;
}

function getSettings() {
  try {
    return wx.getStorageSync(SETTINGS_KEY) || { remindersEnabled: true };
  } catch (error) {
    return { remindersEnabled: true };
  }
}

function saveSettings(settings) {
  wx.setStorageSync(SETTINGS_KEY, settings);
  return settings;
}

function hasAcceptedPrivacy() {
  return Boolean(wx.getStorageSync(PRIVACY_KEY));
}

function acceptPrivacy() {
  wx.setStorageSync(PRIVACY_KEY, true);
}

module.exports = {
  getTasks,
  saveTasks,
  upsertTask,
  updateTask,
  mergeRemoteTasks,
  getTags,
  saveTags,
  getSettings,
  saveSettings,
  hasAcceptedPrivacy,
  acceptPrivacy
};
