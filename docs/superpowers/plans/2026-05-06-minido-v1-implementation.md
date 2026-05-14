# MiniDo V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native WeChat Mini Program V1 for personal todos with local-first data, today/all views, task details with images, reminders, lightweight tags, and weekly summary.

**Architecture:** Use native Mini Program pages for UI and pure CommonJS utility modules for task behavior. Keep domain logic in `utils/taskCore.js` so sorting, validation, weekly report generation, tag suggestions, and merge rules are testable with Node's built-in test runner. Keep WeChat-specific IO in `services/*` wrappers.

**Tech Stack:** WeChat Mini Program native JavaScript/WXML/WXSS, Node `node:test` for pure logic tests, WeChat CloudBase APIs behind service adapters.

---

## File Structure

- `package.json`: test script for Node unit tests.
- `project.config.json`, `app.json`, `app.js`, `app.wxss`, `sitemap.json`: Mini Program app shell.
- `utils/taskCore.js`: pure task creation, validation, filtering, sorting, weekly report, tag suggestions, and merge logic.
- `services/storage.js`: local storage wrapper for tasks.
- `services/cloud.js`: CloudBase sync wrapper with graceful failure.
- `services/image.js`: image selection, compression, upload, retry helpers.
- `services/reminder.js`: subscription message authorization and reminder state helpers.
- `pages/index/*`: today/all list, quick input, advanced creation, tag filtering, completed folding.
- `pages/edit/*`: full task editor, image management, reminder retry, delete confirmation.
- `pages/weekly/*`: weekly summary and copy-to-clipboard flow.
- `tests/taskCore.test.js`: behavior tests for core V1 product logic.

## Tasks

### Task 1: Test Harness And Core Behavior Tests

**Files:**
- Create: `package.json`
- Create: `tests/taskCore.test.js`

- [ ] Add `npm test` using Node's built-in test runner.
- [ ] Write tests first for task validation, today view inclusion/sorting, recent tag suggestions, weekly report text, and merge conflict rules.
- [ ] Run `npm test` and verify it fails because `utils/taskCore.js` does not exist.

### Task 2: Core Task Logic

**Files:**
- Create: `utils/taskCore.js`

- [ ] Implement the smallest pure functions required by `tests/taskCore.test.js`.
- [ ] Run `npm test` and verify all tests pass.
- [ ] Keep all time-dependent functions accepting an explicit `now` argument for deterministic tests.

### Task 3: Mini Program Shell

**Files:**
- Create: `project.config.json`
- Create: `app.json`
- Create: `app.js`
- Create: `app.wxss`
- Create: `sitemap.json`

- [ ] Configure native Mini Program pages: `pages/index/index`, `pages/edit/edit`, `pages/weekly/weekly`.
- [ ] Initialize CloudBase only when `wx.cloud` exists.
- [ ] Add restrained global styles for a quiet, utilitarian todo UI.

### Task 4: Service Adapters

**Files:**
- Create: `services/storage.js`
- Create: `services/cloud.js`
- Create: `services/image.js`
- Create: `services/reminder.js`

- [ ] Implement local-first task persistence with `wx.getStorageSync` and `wx.setStorageSync`.
- [ ] Implement cloud sync hooks that fail softly and return status objects.
- [ ] Implement image choose/compress/upload helpers with a 3-image cap.
- [ ] Implement reminder authorization helpers that do not block task saving.

### Task 5: Home Page

**Files:**
- Create: `pages/index/index.js`
- Create: `pages/index/index.wxml`
- Create: `pages/index/index.wxss`
- Create: `pages/index/index.json`

- [ ] Build today/all tabs, defaulting to today.
- [ ] Build bottom quick input and advanced creation panel.
- [ ] Render task list with title, detail excerpt, time badges, image indicator, tags, and completed folding.
- [ ] Support tag filtering in all view and weekly entry from all view.

### Task 6: Edit Page

**Files:**
- Create: `pages/edit/edit.js`
- Create: `pages/edit/edit.wxml`
- Create: `pages/edit/edit.wxss`
- Create: `pages/edit/edit.json`

- [ ] Load task by `id` and edit title, detail, images, due date, reminder time, and tags.
- [ ] Prevent past reminder times.
- [ ] Save locally first and sync/upload/remind in background.
- [ ] Show sync/image/reminder status only on edit page.
- [ ] Confirm before soft delete.

### Task 7: Weekly Page

**Files:**
- Create: `pages/weekly/weekly.js`
- Create: `pages/weekly/weekly.wxml`
- Create: `pages/weekly/weekly.wxss`
- Create: `pages/weekly/weekly.json`

- [ ] Generate current natural-week summary from local tasks.
- [ ] Show completed count, unfinished count, completion rate, grouped completed tasks, and follow-ups.
- [ ] Copy generated weekly report text to clipboard.

### Task 8: Verification

**Files:**
- Verify all changed files.

- [ ] Run `npm test`.
- [ ] Check Mini Program files are present and page paths match `app.json`.
- [ ] Note that full UI verification requires WeChat DevTools because this is a native Mini Program.
