const assert = require('node:assert/strict');
const test = require('node:test');

const {
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
  DEFAULT_TAG_COLOR,
  TAG_COLORS
} = require('../utils/taskCore');

const NOW = new Date('2026-05-06T10:00:00+08:00');

test('validateTaskInput rejects blank title, too many images, too many tags, and past reminders', () => {
  assert.deepEqual(validateTaskInput({ title: '   ' }, NOW), ['标题不能为空']);
  assert.deepEqual(
    validateTaskInput({
      title: '报销材料',
      localImages: [{}, {}, {}, {}],
      tags: ['工作', '财务', '发票', '客户'],
      reminderAt: '2026-05-06T09:59:00+08:00'
    }, NOW),
    ['图片最多 3 张', '标签最多 3 个', '提醒时间不能早于现在']
  );
});

test('createTask normalizes optional fields and starts as pending sync', () => {
  const task = createTask({
    title: '  交报销材料  ',
    detail: ' 发票截图 ',
    tags: ['工作', '工作', '财务', '客户'],
    dueDate: '2026-05-10',
    reminderAt: '2026-05-09T20:00:00+08:00',
    now: NOW,
    id: 'task-1'
  });

  assert.equal(task.id, 'task-1');
  assert.equal(task.title, '交报销材料');
  assert.equal(task.detail, '发票截图');
  assert.deepEqual(task.tags, [
    { name: '工作', color: DEFAULT_TAG_COLOR },
    { name: '财务', color: DEFAULT_TAG_COLOR },
    { name: '客户', color: DEFAULT_TAG_COLOR }
  ]);
  assert.equal(task.syncStatus, 'pending');
  assert.equal(task.reminderStatus, 'pending');
  assert.equal(task.isPinned, false);
  assert.equal(task.sortOrder, 0);
  assert.equal(task.createdAt, NOW.toISOString());
  assert.equal(task.updatedAt, NOW.toISOString());
});

test('createTask stores colored tags with default blue color', () => {
  const task = createTask({
    title: '带标签任务',
    tags: [{ name: '工作', color: TAG_COLORS.red }, '学习'],
    now: NOW,
    id: 'tag-task'
  });

  assert.deepEqual(task.tags, [
    { name: '工作', color: TAG_COLORS.red },
    { name: '学习', color: DEFAULT_TAG_COLOR }
  ]);
});

test('getTodayView includes due, today reminders, elapsed reminders, and folds overdue tasks', () => {
  const tasks = [
    baseTask({ id: 'old-overdue', title: '很早逾期', dueDate: '2026-05-01', updatedAt: '2026-05-01T08:00:00+08:00' }),
    baseTask({ id: 'overdue', title: '昨天截止', dueDate: '2026-05-05', updatedAt: '2026-05-05T08:00:00+08:00' }),
    baseTask({ id: 'elapsed-reminder', title: '已提醒', reminderAt: '2026-05-06T09:00:00+08:00' }),
    baseTask({ id: 'today-reminder', title: '今天提醒', reminderAt: '2026-05-06T16:00:00+08:00' }),
    baseTask({ id: 'today-due', title: '今天截止', dueDate: '2026-05-06' }),
    baseTask({ id: 'future', title: '以后再做', dueDate: '2026-05-08' }),
    baseTask({ id: 'done', title: '已完成', dueDate: '2026-05-06', completedAt: '2026-05-06T09:30:00+08:00' }),
    baseTask({ id: 'deleted', title: '已删除', dueDate: '2026-05-06', deletedAt: '2026-05-06T09:30:00+08:00' })
  ];

  const view = getTodayView(tasks, NOW);

  assert.deepEqual(view.active.map((task) => task.id), [
    'elapsed-reminder',
    'today-reminder',
    'today-due'
  ]);
  assert.deepEqual(view.overdue.map((task) => task.id), ['old-overdue', 'overdue']);
  assert.deepEqual(view.olderOverdue.map((task) => task.id), ['old-overdue']);
  assert.deepEqual(view.completed.map((task) => task.id), ['done']);
});

test('getTodayView folds all overdue tasks separately and sorts pinned tasks first', () => {
  const tasks = [
    baseTask({ id: 'normal', title: '普通', dueDate: '2026-05-06', sortOrder: 2, createdAt: '2026-05-01T09:00:00+08:00' }),
    baseTask({ id: 'pinned', title: '置顶', dueDate: '2026-05-06', isPinned: true, sortOrder: 99, createdAt: '2026-05-03T09:00:00+08:00' }),
    baseTask({ id: 'manual-first', title: '手排前', dueDate: '2026-05-06', sortOrder: 1, createdAt: '2026-05-02T09:00:00+08:00' }),
    baseTask({ id: 'overdue', title: '已逾期', dueDate: '2026-05-05' }),
    baseTask({ id: 'old-overdue', title: '七天前逾期', dueDate: '2026-04-28' })
  ];

  const view = getTodayView(tasks, NOW);

  assert.deepEqual(view.active.map((task) => task.id), ['pinned', 'manual-first', 'normal']);
  assert.deepEqual(view.overdue.map((task) => task.id), ['old-overdue', 'overdue']);
  assert.deepEqual(view.olderOverdue.map((task) => task.id), ['old-overdue']);
});

test('getAllView sorts incomplete due tasks first, supports tag filtering, and folds completed tasks', () => {
  const tasks = [
    baseTask({ id: 'no-date', title: '无日期', updatedAt: '2026-05-06T09:00:00+08:00' }),
    baseTask({ id: 'later', title: '后天', dueDate: '2026-05-08', tags: [{ name: '工作', color: TAG_COLORS.blue }] }),
    baseTask({ id: 'soon', title: '明天', dueDate: '2026-05-07', tags: [{ name: '工作', color: TAG_COLORS.blue }] }),
    baseTask({ id: 'done', title: '完成', tags: [{ name: '工作', color: TAG_COLORS.blue }], completedAt: '2026-05-06T09:00:00+08:00' }),
    baseTask({ id: 'study', title: '学习', dueDate: '2026-05-06', tags: [{ name: '学习', color: TAG_COLORS.green }] })
  ];

  const view = getAllView(tasks, { tag: '工作', now: NOW });

  assert.deepEqual(view.active.map((task) => task.id), ['soon', 'later']);
  assert.deepEqual(view.completed.map((task) => task.id), ['done']);
});

test('getAllView places overdue older than 7 days at the bottom bucket', () => {
  const tasks = [
    baseTask({ id: 'active', title: '今日', dueDate: '2026-05-06' }),
    baseTask({ id: 'very-old', title: '很久以前', dueDate: '2026-04-20' })
  ];

  const view = getAllView(tasks, { now: NOW });

  assert.deepEqual(view.active.map((task) => task.id), ['active']);
  assert.deepEqual(view.staleOverdue.map((task) => task.id), ['very-old']);
});

test('getRecentTags returns the latest unique tags from active and completed tasks', () => {
  const tasks = [
    baseTask({ id: '1', tags: [{ name: '学习', color: TAG_COLORS.green }], updatedAt: '2026-05-01T10:00:00+08:00' }),
    baseTask({ id: '2', tags: [{ name: '工作', color: TAG_COLORS.blue }, { name: '客户A', color: TAG_COLORS.orange }], updatedAt: '2026-05-06T09:00:00+08:00' }),
    baseTask({ id: '3', tags: [{ name: '工作', color: TAG_COLORS.blue }, { name: '财务', color: TAG_COLORS.purple }], updatedAt: '2026-05-05T09:00:00+08:00' })
  ];

  assert.deepEqual(getRecentTags(tasks, 3), [
    { name: '工作', color: TAG_COLORS.blue },
    { name: '客户A', color: TAG_COLORS.orange },
    { name: '财务', color: TAG_COLORS.purple }
  ]);
});

test('generateWeeklyReport summarizes completed tasks, follow-ups, and completion rate', () => {
  const tasks = [
    baseTask({ id: 'done-work', title: '完成需求文档', tags: [{ name: '工作', color: TAG_COLORS.blue }], completedAt: '2026-05-05T16:00:00+08:00' }),
    baseTask({ id: 'done-study', title: '阅读云开发文档', tags: [{ name: '学习', color: TAG_COLORS.green }], completedAt: '2026-05-06T12:00:00+08:00' }),
    baseTask({ id: 'follow-up', title: '提交报销材料', tags: [{ name: '工作', color: TAG_COLORS.blue }], dueDate: '2026-05-08' }),
    baseTask({ id: 'future', title: '下周事项', dueDate: '2026-05-14' })
  ];

  const report = generateWeeklyReport(tasks, NOW);

  assert.equal(report.completedCount, 2);
  assert.equal(report.unfinishedCount, 1);
  assert.equal(report.completionRate, 67);
  assert.match(report.text, /本周完成 2 项，未完成 1 项，完成率 67%。/);
  assert.match(report.text, /【工作】\n- 完成需求文档/);
  assert.match(report.text, /【学习】\n- 阅读云开发文档/);
  assert.match(report.text, /待跟进：\n- 提交报销材料/);
});

test('postponeTaskByDays moves due date and reminder date together', () => {
  const task = baseTask({
    id: 'postpone',
    title: '明天再说',
    dueDate: '2026-05-06',
    reminderAt: '2026-05-06T18:00:00+08:00'
  });

  const next = postponeTaskByDays(task, 1, NOW);

  assert.equal(next.dueDate, '2026-05-07');
  assert.equal(next.reminderAt, '2026-05-07T18:00:00+08:00');
  assert.equal(next.syncStatus, 'pending');
  assert.equal(next.updatedAt, NOW.toISOString());
});

test('pinTask and updateTaskSortOrder update ordering fields', () => {
  const pinned = pinTask(baseTask({ id: 'pin', title: '置顶' }), true, NOW);
  const sorted = updateTaskSortOrder(pinned, 42, NOW);

  assert.equal(pinned.isPinned, true);
  assert.equal(sorted.sortOrder, 42);
  assert.equal(sorted.updatedAt, NOW.toISOString());
});

test('mergeTaskRecords keeps the newer updatedAt record', () => {
  const local = baseTask({
    id: 'task-1',
    title: '本地标题',
    completedAt: '2026-05-06T09:00:00+08:00',
    updatedAt: '2026-05-06T09:00:00+08:00'
  });
  const remote = baseTask({
    id: 'task-1',
    title: '云端标题',
    updatedAt: '2026-05-06T09:30:00+08:00'
  });

  const completedMerged = mergeTaskRecords(local, remote);
  assert.equal(completedMerged.title, '云端标题');
  assert.equal(completedMerged.completedAt, '');

  const deletedMerged = mergeTaskRecords(
    baseTask({ id: 'task-2', title: '本地', updatedAt: '2026-05-06T09:00:00+08:00' }),
    baseTask({ id: 'task-2', title: '云端', deletedAt: '2026-05-06T09:10:00+08:00', updatedAt: '2026-05-06T09:10:00+08:00' })
  );
  assert.equal(deletedMerged.deletedAt, '2026-05-06T09:10:00+08:00');
});

test('mergeTaskRecords keeps the record with newer updatedAt', () => {
  const merged = mergeTaskRecords(
    baseTask({ id: 'task-3', title: '旧', updatedAt: '2026-05-06T08:00:00+08:00' }),
    baseTask({ id: 'task-3', title: '新', updatedAt: '2026-05-06T09:00:00+08:00' })
  );

  assert.equal(merged.title, '新');
});

test('mergeTaskCollections uploads local-only tasks and downloads remote-only tasks', () => {
  const local = [
    baseTask({ id: 'local-only', title: '本地' }),
    baseTask({ id: 'both', title: '本地旧', updatedAt: '2026-05-06T08:00:00+08:00' })
  ];
  const remote = [
    baseTask({ id: 'remote-only', title: '云端' }),
    baseTask({ id: 'both', title: '云端新', updatedAt: '2026-05-06T09:00:00+08:00' })
  ];

  const result = mergeTaskCollections(local, remote);

  assert.deepEqual(result.merged.map((task) => task.id).sort(), ['both', 'local-only', 'remote-only']);
  assert.equal(result.merged.find((task) => task.id === 'both').title, '云端新');
  assert.deepEqual(result.toUpload.map((task) => task.id), ['local-only']);
  assert.deepEqual(result.toDownload.map((task) => task.id).sort(), ['both', 'remote-only']);
});

test('getTaskStats, exportTasksAsJson, and copyTasksText support mine page exports', () => {
  const tasks = [
    baseTask({ id: 'a', title: '未完成', dueDate: '2026-05-06' }),
    baseTask({ id: 'b', title: '已完成', completedAt: '2026-05-06T09:00:00+08:00' }),
    baseTask({ id: 'c', title: '删除', deletedAt: '2026-05-06T09:00:00+08:00' })
  ];

  const stats = getTaskStats(tasks);
  assert.deepEqual(stats, { total: 2, completed: 1, completionRate: 50 });
  assert.match(exportTasksAsJson(tasks), /"title": "未完成"/);
  assert.equal(copyTasksText(tasks, { scope: 'unfinished' }), '☐ 未完成 | 2026-05-06');
  assert.equal(copyTasksText(tasks, { scope: 'today', now: NOW }), '☐ 未完成 | 2026-05-06');
});

function baseTask(overrides) {
  return {
    id: overrides.id,
    title: overrides.title,
    detail: '',
    imageFileIds: [],
    localImages: [],
    tags: overrides.tags || [],
    dueDate: overrides.dueDate || '',
    reminderAt: overrides.reminderAt || '',
    reminderStatus: 'none',
    completedAt: overrides.completedAt || '',
    deletedAt: overrides.deletedAt || '',
    createdAt: overrides.createdAt || '2026-05-01T08:00:00+08:00',
    updatedAt: overrides.updatedAt || '2026-05-06T08:00:00+08:00',
    sortOrder: overrides.sortOrder || 0,
    isPinned: overrides.isPinned || false,
    syncStatus: 'synced'
  };
}
