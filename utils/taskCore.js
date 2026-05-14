const DEFAULT_TIME_ZONE = 'Asia/Shanghai';
const MAX_IMAGES = 3;
const MAX_TAGS = 3;
const TAG_COLORS = {
  red: '#FF6B6B',
  orange: '#FFA94D',
  yellow: '#FFD43B',
  green: '#69DB7C',
  blue: '#4DABF7',
  purple: '#9775FA',
  pink: '#F783AC',
  gray: '#ADB5BD'
};
const DEFAULT_TAG_COLOR = TAG_COLORS.blue;

function validateTaskInput(input, now = new Date()) {
  const errors = [];
  if (!String(input.title || '').trim()) {
    errors.push('标题不能为空');
  }
  if ((input.localImages || input.imageFileIds || []).length > MAX_IMAGES) {
    errors.push('图片最多 3 张');
  }
  if ((input.tags || []).length > MAX_TAGS) {
    errors.push('标签最多 3 个');
  }
  if (input.reminderAt && new Date(input.reminderAt).getTime() < now.getTime()) {
    errors.push('提醒时间不能早于现在');
  }
  return errors;
}

function createTask(input) {
  const now = input.now || new Date();
  const nowIso = now.toISOString();
  const reminderAt = input.reminderAt || '';
  return {
    id: input.id || createId(now),
    openid: input.openid || '',
    title: String(input.title || '').trim(),
    detail: String(input.detail || '').trim(),
    imageFileIds: (input.imageFileIds || []).slice(0, MAX_IMAGES),
    localImages: (input.localImages || []).slice(0, MAX_IMAGES),
    tags: normalizeTags(input.tags || []),
    dueDate: input.dueDate || '',
    reminderAt,
    reminderStatus: reminderAt ? 'pending' : 'none',
    completedAt: '',
    deletedAt: '',
    createdAt: nowIso,
    updatedAt: nowIso,
    sortOrder: Number(input.sortOrder || 0),
    isPinned: Boolean(input.isPinned),
    syncStatus: 'pending'
  };
}

function getTodayView(tasks, now = new Date()) {
  const todayKey = getDateKey(now);
  const activeCandidates = [];
  const overdue = [];
  const olderOverdue = [];
  const completed = [];

  visibleTasks(tasks).forEach((task) => {
    if (!isTodayRelevant(task, now, todayKey)) {
      return;
    }
    if (task.completedAt) {
      completed.push(task);
      return;
    }
    const priority = getTodayPriority(task, now, todayKey);
    const decorated = { task, priority };
    if (task.dueDate && task.dueDate < todayKey) {
      overdue.push(task);
    } else {
      activeCandidates.push(decorated);
    }
    if (isOlderOverdue(task, todayKey)) {
      olderOverdue.push(task);
    }
  });

  activeCandidates.sort(compareDecoratedTodayTasks);
  completed.sort(compareCompletedTasks);
  overdue.sort(compareTasksByDueThenUpdate);
  olderOverdue.sort(compareTasksByDueThenUpdate);

  return {
    active: activeCandidates.map((item) => item.task),
    overdue,
    olderOverdue,
    completed
  };
}

function getAllView(tasks, options = {}) {
  const now = options.now || new Date();
  const todayKey = getDateKey(now);
  const visible = visibleTasks(tasks).filter((task) => {
    if (!options.tag) {
      return true;
    }
    return hasTag(task, options.tag);
  });
  const staleOverdue = visible.filter((task) => !task.completedAt && isStaleOverdue(task, todayKey));
  const staleIds = new Set(staleOverdue.map((task) => task.id));
  const active = visible.filter((task) => !task.completedAt && !staleIds.has(task.id));
  const completed = visible.filter((task) => task.completedAt);
  active.sort(compareAllActiveTasks);
  staleOverdue.sort(compareTasksByDueThenUpdate);
  completed.sort(compareCompletedTasks);
  return { active, staleOverdue, completed };
}

function getRecentTags(tasks, limit = 5) {
  const tags = [];
  visibleTasks(tasks)
    .slice()
    .sort((a, b) => compareDateDesc(a.updatedAt, b.updatedAt))
    .forEach((task) => {
      normalizeTags(task.tags || []).forEach((tag) => {
        if (tag.name && !tags.some((item) => item.name === tag.name) && tags.length < limit) {
          tags.push(tag);
        }
      });
    });
  return tags;
}

function generateWeeklyReport(tasks, now = new Date()) {
  const range = getNaturalWeekRange(now);
  const visible = visibleTasks(tasks);
  const completedThisWeek = visible.filter((task) => {
    if (!task.completedAt) {
      return false;
    }
    const key = getDateKey(new Date(task.completedAt));
    return key >= range.start && key <= range.end;
  });
  const followUps = visible.filter((task) => {
    if (task.completedAt) {
      return false;
    }
    if (task.createdAt && getDateKey(new Date(task.createdAt)) > range.end) {
      return false;
    }
    return (task.dueDate && task.dueDate <= range.end) ||
      (task.reminderAt && getDateKey(new Date(task.reminderAt)) <= range.end);
  });
  const denominator = completedThisWeek.length + followUps.length;
  const completionRate = denominator === 0 ? 0 : Math.round((completedThisWeek.length / denominator) * 100);
  const grouped = groupCompletedByTag(completedThisWeek);
  const text = buildWeeklyReportText(completedThisWeek.length, followUps.length, completionRate, grouped, followUps);

  return {
    completedCount: completedThisWeek.length,
    unfinishedCount: followUps.length,
    completionRate,
    grouped,
    followUps,
    text
  };
}

function mergeTaskRecords(local, remote) {
  if (!local) {
    return remote;
  }
  if (!remote) {
    return local;
  }
  return compareDateAsc(local.updatedAt, remote.updatedAt) >= 0 ? local : remote;
}

function mergeTaskCollections(localTasks, remoteTasks) {
  const localById = indexById(localTasks);
  const remoteById = indexById(remoteTasks);
  const ids = Array.from(new Set(Object.keys(localById).concat(Object.keys(remoteById))));
  const merged = [];
  const toUpload = [];
  const toDownload = [];

  ids.forEach((id) => {
    const local = localById[id];
    const remote = remoteById[id];
    if (local && remote) {
      const next = mergeTaskRecords(local, remote);
      merged.push(next);
      if (next === local && local.updatedAt !== remote.updatedAt) {
        toUpload.push(next);
      }
      if (next === remote && local.updatedAt !== remote.updatedAt) {
        toDownload.push(next);
      }
      return;
    }
    if (local) {
      merged.push(local);
      toUpload.push(local);
      return;
    }
    merged.push(remote);
    toDownload.push(remote);
  });

  merged.sort((a, b) => compareDateDesc(a.updatedAt, b.updatedAt));
  return { merged, toUpload, toDownload };
}

function postponeTaskByDays(task, days = 1, now = new Date()) {
  const patch = {
    ...task,
    updatedAt: now.toISOString(),
    syncStatus: 'pending'
  };
  if (task.dueDate) {
    patch.dueDate = addDaysToKey(task.dueDate, days);
  }
  if (task.reminderAt) {
    patch.reminderAt = addDaysToDateTime(task.reminderAt, days);
    if (task.reminderStatus === 'enabled') {
      patch.reminderStatus = 'pending';
    }
  }
  return patch;
}

function pinTask(task, isPinned = true, now = new Date()) {
  return {
    ...task,
    isPinned: Boolean(isPinned),
    updatedAt: now.toISOString(),
    syncStatus: 'pending'
  };
}

function updateTaskSortOrder(task, sortOrder, now = new Date()) {
  return {
    ...task,
    sortOrder: Number(sortOrder || 0),
    updatedAt: now.toISOString(),
    syncStatus: 'pending'
  };
}

function getTaskStats(tasks) {
  const visible = visibleTasks(tasks);
  const completed = visible.filter((task) => task.completedAt);
  const completionRate = visible.length ? Math.round((completed.length / visible.length) * 100) : 0;
  return {
    total: visible.length,
    completed: completed.length,
    completionRate
  };
}

function exportTasksAsJson(tasks) {
  return JSON.stringify(visibleTasks(tasks), null, 2);
}

function copyTasksText(tasks, options = {}) {
  let source = visibleTasks(tasks).filter((task) => !task.completedAt);
  if (options.scope === 'today') {
    const today = getTodayView(source, options.now || new Date());
    source = today.active.concat(today.overdue);
  }
  source.sort(compareAllActiveTasks);
  return source.map((task) => `☐ ${task.title} | ${task.dueDate || '无截止日期'}`).join('\n');
}

function visibleTasks(tasks) {
  return (tasks || []).filter((task) => !task.deletedAt);
}

function isTodayRelevant(task, now, todayKey) {
  if (task.dueDate && task.dueDate <= todayKey) {
    return true;
  }
  if (!task.reminderAt) {
    return false;
  }
  const reminderDate = new Date(task.reminderAt);
  const reminderKey = getDateKey(reminderDate);
  return reminderKey === todayKey || reminderDate.getTime() <= now.getTime();
}

function getTodayPriority(task, now, todayKey) {
  if (task.dueDate && task.dueDate < todayKey) {
    return 1;
  }
  if (task.reminderAt && new Date(task.reminderAt).getTime() <= now.getTime()) {
    return 2;
  }
  if (task.reminderAt && getDateKey(new Date(task.reminderAt)) === todayKey) {
    return 3;
  }
  if (task.dueDate === todayKey) {
    return 4;
  }
  return 5;
}

function isOlderOverdue(task, todayKey) {
  if (!task.dueDate || task.dueDate >= todayKey) {
    return false;
  }
  return daysBetween(task.dueDate, todayKey) > 3;
}

function compareDecoratedTodayTasks(a, b) {
  const pinResult = comparePinnedAndManualOrder(a.task, b.task);
  if (pinResult !== 0) {
    return pinResult;
  }
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }
  return compareTodayTieBreakers(a.task, b.task);
}

function compareTodayTieBreakers(a, b) {
  if (a.reminderAt && b.reminderAt && a.reminderAt !== b.reminderAt) {
    return compareDateAsc(a.reminderAt, b.reminderAt);
  }
  if (a.reminderAt && !b.reminderAt) {
    return -1;
  }
  if (!a.reminderAt && b.reminderAt) {
    return 1;
  }
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
    return a.dueDate.localeCompare(b.dueDate);
  }
  if (a.dueDate && !b.dueDate) {
    return -1;
  }
  if (!a.dueDate && b.dueDate) {
    return 1;
  }
  return compareDateDesc(a.updatedAt, b.updatedAt);
}

function compareAllActiveTasks(a, b) {
  const pinResult = comparePinnedAndManualOrder(a, b);
  if (pinResult !== 0) {
    return pinResult;
  }
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
    return a.dueDate.localeCompare(b.dueDate);
  }
  if (a.dueDate && !b.dueDate) {
    return -1;
  }
  if (!a.dueDate && b.dueDate) {
    return 1;
  }
  return compareDateDesc(a.updatedAt, b.updatedAt);
}

function compareCompletedTasks(a, b) {
  return compareDateDesc(a.completedAt || a.updatedAt, b.completedAt || b.updatedAt);
}

function compareTasksByDueThenUpdate(a, b) {
  const pinResult = comparePinnedAndManualOrder(a, b);
  if (pinResult !== 0) {
    return pinResult;
  }
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
    return a.dueDate.localeCompare(b.dueDate);
  }
  return compareDateDesc(a.updatedAt, b.updatedAt);
}

function groupCompletedByTag(tasks) {
  const grouped = {};
  tasks.forEach((task) => {
    const tags = task.tags && task.tags.length ? normalizeTags(task.tags).map((tag) => tag.name) : ['未分类'];
    tags.forEach((tag) => {
      if (!grouped[tag]) {
        grouped[tag] = [];
      }
      grouped[tag].push(task);
    });
  });
  return grouped;
}

function buildWeeklyReportText(completedCount, unfinishedCount, completionRate, grouped, followUps) {
  const lines = [`本周完成 ${completedCount} 项，未完成 ${unfinishedCount} 项，完成率 ${completionRate}%。`, ''];
  Object.keys(grouped).forEach((tag) => {
    lines.push(`【${tag}】`);
    grouped[tag].forEach((task) => lines.push(`- ${task.title}`));
    lines.push('');
  });
  if (followUps.length) {
    lines.push('待跟进：');
    followUps.forEach((task) => lines.push(`- ${task.title}`));
  } else {
    lines.push('待跟进：无');
  }
  return lines.join('\n').trim();
}

function normalizeTags(tags) {
  const normalized = [];
  tags.forEach((tag) => {
    const normalizedTag = normalizeTag(tag);
    if (normalizedTag.name && !normalized.some((item) => item.name === normalizedTag.name) && normalized.length < MAX_TAGS) {
      normalized.push(normalizedTag);
    }
  });
  return normalized;
}

function normalizeTag(tag) {
  if (typeof tag === 'object' && tag !== null) {
    const name = String(tag.name || '').trim();
    return {
      name,
      color: isKnownTagColor(tag.color) ? tag.color : DEFAULT_TAG_COLOR
    };
  }
  return {
    name: String(tag || '').trim(),
    color: DEFAULT_TAG_COLOR
  };
}

function hasTag(task, tagName) {
  return normalizeTags(task.tags || []).some((tag) => tag.name === tagName);
}

function isKnownTagColor(color) {
  return Object.values(TAG_COLORS).includes(color);
}

function isStaleOverdue(task, todayKey) {
  return Boolean(task.dueDate && task.dueDate < todayKey && daysBetween(task.dueDate, todayKey) > 7);
}

function comparePinnedAndManualOrder(a, b) {
  if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
    return a.isPinned ? -1 : 1;
  }
  const aOrder = Number(a.sortOrder || 0);
  const bOrder = Number(b.sortOrder || 0);
  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  return compareDateAsc(a.createdAt, b.createdAt);
}

function indexById(tasks) {
  const byId = {};
  (tasks || []).forEach((task) => {
    byId[task.id] = task;
  });
  return byId;
}

function createId(now) {
  return `task_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getDateKey(date, timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getNaturalWeekRange(now) {
  const todayKey = getDateKey(now);
  const weekday = getWeekday(todayKey);
  const offsetFromMonday = weekday === 0 ? 6 : weekday - 1;
  return {
    start: addDaysToKey(todayKey, -offsetFromMonday),
    end: addDaysToKey(todayKey, 6 - offsetFromMonday)
  };
}

function getWeekday(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function addDaysToKey(key, offset) {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-');
}

function addDaysToDateTime(value, offset) {
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})(.*)$/);
  if (!match) {
    return value;
  }
  return `${addDaysToKey(match[1], offset)}${match[2]}`;
}

function daysBetween(startKey, endKey) {
  const [startYear, startMonth, startDay] = startKey.split('-').map(Number);
  const [endYear, endMonth, endDay] = endKey.split('-').map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.round((end - start) / 86400000);
}

function compareDateAsc(a, b) {
  return new Date(a || 0).getTime() - new Date(b || 0).getTime();
}

function compareDateDesc(a, b) {
  return new Date(b || 0).getTime() - new Date(a || 0).getTime();
}

function maxDateString(a, b) {
  if (!a) {
    return b || '';
  }
  if (!b) {
    return a || '';
  }
  return compareDateAsc(a, b) >= 0 ? a : b;
}

module.exports = {
  MAX_IMAGES,
  MAX_TAGS,
  TAG_COLORS,
  DEFAULT_TAG_COLOR,
  createTask,
  validateTaskInput,
  getTodayView,
  getAllView,
  getRecentTags,
  generateWeeklyReport,
  mergeTaskRecords,
  mergeTaskCollections,
  postponeTaskByDays,
  pinTask,
  updateTaskSortOrder,
  getTaskStats,
  exportTasksAsJson,
  copyTasksText,
  getDateKey,
  getNaturalWeekRange
};
