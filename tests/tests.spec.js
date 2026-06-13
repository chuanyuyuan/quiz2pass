// @ts-check
const { test, expect } = require('@playwright/test');

async function goTo(page, view) {
  await page.evaluate((v) => window.showView(v), view);
  await page.waitForTimeout(80);
}

/** Get localStorage item */
async function getLS(page, key) {
  return page.evaluate((k) => {
    try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
  }, key);
}

/** Clear all app data from localStorage AND reset in-memory state */
async function resetApp(page) {
  await page.evaluate(() => {
    ['q2p_wrong', 'q2p_h', 'q2p_fav', 'q2p_setup'].forEach(k => localStorage.removeItem(k));
    Object.keys(localStorage).filter(k => k.startsWith('seq_')).forEach(k => localStorage.removeItem(k));
    wrongMap = {};
    historyMap = {};
    favMap = {};
    S.subject = 'all';
    S.types = ['单选', '多选', '判断'];
    S.countMode = 'random';
    S.quizSource = 'setup';
  });
}

/** Click an option button via evaluate (reliable, bypasses Playwright actionability checks) */
async function clickOpt(page, label) {
  await page.evaluate((l) => {
    const btn = document.querySelector(`.option-btn[data-label="${l}"]`);
    if (btn) btn.click();
  }, label);
}

/** Answer current question correctly via evaluate (calls submitAnswer directly) */
async function answerCurrent(page) {
  await page.evaluate(() => {
    const q = S.quizQ[S.qIdx];
    if (!q) return;
    submitAnswer(q.answer);
  });
}

/** Navigate to setup with rendered chips (simulates real flow) */
async function goSetup(page) {
  await goTo(page, 'setup');
  await page.evaluate(() => renderSetup());
  await page.waitForTimeout(50);
}

// ──────────────────────────────────────────────
// DATA INTEGRITY
// ──────────────────────────────────────────────
test.describe('Data Integrity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/index.html');
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
  });

  test('loads all 973 questions', async ({ page }) => {
    expect(await page.evaluate(() => allQuestions.length)).toBe(973);
  });

  test('edu 472, psych 501', async ({ page }) => {
    const c = await page.evaluate(() => ({ edu: rawData.edu.length, psych: rawData.psych.length }));
    expect(c.edu).toBe(472); expect(c.psych).toBe(501);
  });

  test('all questions have required fields', async ({ page }) => {
    const ok = await page.evaluate(() => allQuestions.every(q =>
      typeof q.type === 'string' && typeof q.num === 'number' &&
      typeof q.text === 'string' && typeof q.options === 'object' &&
      typeof q.answer === 'string' && typeof q.explanation === 'string'));
    expect(ok).toBe(true);
  });

  test('valid types: 单选 多选 判断', async ({ page }) => {
    const types = await page.evaluate(() => [...new Set(allQuestions.map(q => q.type))].sort());
    expect(types).toEqual(['判断', '单选', '多选']); // Chinese Unicode sort order
  });

  test('valid subjects: edu psych', async ({ page }) => {
    const s = await page.evaluate(() => [...new Set(allQuestions.map(q => q.subject))].sort());
    expect(s).toEqual(['edu', 'psych']);
  });

  test('type counts match expected', async ({ page }) => {
    const c = await page.evaluate(() => ({
      edu: { 单选: rawData.edu.filter(q=>q.type==='单选').length, 多选: rawData.edu.filter(q=>q.type==='多选').length, 判断: rawData.edu.filter(q=>q.type==='判断').length },
      psych: { 单选: rawData.psych.filter(q=>q.type==='单选').length, 多选: rawData.psych.filter(q=>q.type==='多选').length, 判断: rawData.psych.filter(q=>q.type==='判断').length },
    }));
    expect(c.edu.单选).toBe(304); expect(c.edu.多选).toBe(83); expect(c.edu.判断).toBe(85);
    expect(c.psych.判断).toBe(257); expect(c.psych.单选).toBe(135); expect(c.psych.多选).toBe(109);
  });
});

// ──────────────────────────────────────────────
// HOME PAGE
// ──────────────────────────────────────────────
test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/index.html');
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    await resetApp(page);
    await goTo(page, 'home');
  });

  test('displays hero title and subject cards', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('两学刷题');
    await expect(page.locator('.subject-card')).toHaveCount(2);
    await expect(page.locator('.subject-card').first()).toContainText('高等教育学');
    await expect(page.locator('.subject-card').nth(1)).toContainText('高等教育心理学');
  });

  test('shows 973 in bottom stats', async ({ page }) => {
    await expect(page.locator('#homeBottom')).toContainText('973');
  });

  test('has 4 action buttons', async ({ page }) => {
    await expect(page.locator('#btnStartQuiz')).toBeVisible();
    await expect(page.locator('#btnFav')).toBeVisible();
    await expect(page.locator('#btnHistory')).toBeVisible();
    await expect(page.locator('#btnWrongReview')).toBeVisible();
  });

  test('clicking subject card goes to setup with correct subject', async ({ page }) => {
    await page.locator('.subject-card').first().click();
    await expect(page.locator('#page-setup')).toHaveClass(/active/);
    expect(await page.evaluate(() => S.subject)).toBe('edu');
  });

  test('clicking 开始刷题 sets subject=all', async ({ page }) => {
    await page.locator('#btnStartQuiz').click();
    await expect(page.locator('#page-setup')).toHaveClass(/active/);
    expect(await page.evaluate(() => S.subject)).toBe('all');
  });

  test('shows history badge', async ({ page }) => {
    await page.evaluate(() => { historyMap = { 'edu-1-单选': { count: 3, correct: 2 } }; saveHistory(); });
    await goTo(page, 'home');
    await expect(page.locator('#historyBadge')).toContainText('1题');
  });

  test('shows wrong count badge', async ({ page }) => {
    await page.evaluate(() => { wrongMap = { 'edu-5-单选': { userAnswer: 'B', time: Date.now() } }; saveWrong(); });
    await goTo(page, 'home');
    await expect(page.locator('#wrongCountBadge')).toContainText('1题');
  });

  test('shows fav badge', async ({ page }) => {
    await page.evaluate(() => { favMap = { 'edu-1-单选': { time: Date.now() } }; saveFav(); });
    await goTo(page, 'home');
    await expect(page.locator('#favBadge')).toContainText('1题');
  });
});

// ──────────────────────────────────────────────
// SETUP PAGE
// ──────────────────────────────────────────────
test.describe('Setup Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/index.html');
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    await resetApp(page);
    await goSetup(page);
  });

  test('3 subject chips: 全部 高等教育学 高等教育心理学', async ({ page }) => {
    const chips = page.locator('#subjectChips .chip');
    await expect(chips).toHaveCount(3);
    await expect(chips.nth(0)).toContainText('全部科目');
    await expect(chips.nth(1)).toContainText('高等教育学');
    await expect(chips.nth(2)).toContainText('高等教育心理学');
  });

  test('3 type chips all active by default', async ({ page }) => {
    const chips = page.locator('#typeChips .chip');
    await expect(chips).toHaveCount(3);
    for (const c of await chips.all()) await expect(c).toHaveClass(/active/);
  });

  test('2 count mode chips', async ({ page }) => {
    const chips = page.locator('#countChips .chip');
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toHaveClass(/active/);
  });

  test('cannot deselect last type', async ({ page }) => {
    await page.locator('#typeChips .chip').nth(1).click(); // deselect 多选
    await page.locator('#typeChips .chip').nth(2).click(); // deselect 判断
    await page.locator('#typeChips .chip').nth(0).click(); // try deselect 单选
    await expect(page.locator('#typeChips .chip').nth(0)).toHaveClass(/active/);
    expect(await page.evaluate(() => S.types)).toEqual(['单选']);
  });

  test('switching subject updates count', async ({ page }) => {
    expect(await page.locator('#countInput').inputValue()).toBe('20');
    await page.locator('#subjectChips .chip').nth(1).click();
    expect(await page.locator('#countInput').inputValue()).toBe('20');
    await page.locator('#subjectChips .chip').nth(2).click();
    expect(await page.locator('#countInput').inputValue()).toBe('20');
  });

  test('sequential mode shows progress info', async ({ page }) => {
    await page.locator('#countChips .chip').nth(1).click();
    await expect(page.locator('#countSeqWrap')).toBeVisible();
    await expect(page.locator('#seqProgressDisplay')).toContainText('第 1 题');
  });

  test('sequential shows reset btn when progress exists', async ({ page }) => {
    await page.evaluate(() => {
      // Store progress using getSeqKey() to ensure correct sorted key format
      S.subject = 'edu';
      const key = getSeqKey();
      localStorage.setItem(key, JSON.stringify({ position: 50, total: 304, updated: Date.now() }));
    });
    await goSetup(page);
    await page.locator('#subjectChips .chip').nth(1).click(); // edu — matches stored subject
    await page.locator('#countChips .chip').nth(1).click(); // sequential
    await expect(page.locator('#seqProgressDisplay')).toContainText('50');
    await expect(page.locator('#btnResetSeq')).toBeVisible();
  });

  test('start button visible', async ({ page }) => {
    await expect(page.locator('#btnStart')).toBeVisible();
  });

  test('skip correct toggle visible and off by default', async ({ page }) => {
    const slider = page.locator('#skipCorrectSlider');
    await expect(slider).toBeVisible();
    expect(await page.evaluate(() => S.skipCorrect)).toBe(false);
  });

  test('skip correct toggle on filters out attempted questions', async ({ page }) => {
    await page.locator('#subjectChips .chip').nth(1).click(); // edu
    await page.locator('#typeChips .chip').nth(1).click(); // deselect 多选
    await page.locator('#typeChips .chip').nth(2).click(); // deselect 判断
    await page.locator('#countInput').fill('5');
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    const firstQ = await page.evaluate(() => { const q=S.quizQ[0]; return { subject:q.subject, num:q.num, type:q.type }; });
    await answerCurrent(page);
    await page.waitForTimeout(80);
    await page.locator('#btnBack').click();
    await page.waitForTimeout(50);
    // Turn on skip correct via JS (toggle checkbox is opacity:0 / not visible)
    await page.evaluate(() => { S.skipCorrect=true; saveSetup(); updateCountUI(getFilteredQuestions().length); });
    await page.waitForTimeout(80);
    const totalText = await page.locator('#setupTotal').textContent();
    expect(totalText).toContain('未刷');
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    // The attempted question should NOT be in the quiz
    const hasFirst = await page.evaluate((fq) => S.quizQ.some(q => q.num===fq.num && q.subject===fq.subject && q.type===fq.type), firstQ);
    expect(hasFirst).toBe(false);
  });

  test('all attempted with toggle on shows toast', async ({ page }) => {
    // Mark all edu+单选 questions as attempted
    await page.evaluate(() => {
      allQuestions.filter(q => q.subject==='edu' && q.type==='单选').forEach(q => {
        const k = q.subject + '-' + q.num + '-' + q.type;
        historyMap[k] = { count: 1, correct: 0 };
      });
      saveHistory();
    });
    // Select edu+单选 and enable skipCorrect
    await page.locator('#subjectChips .chip').nth(1).click(); // edu
    await page.locator('#typeChips .chip').nth(1).click(); // deselect 多选
    await page.locator('#typeChips .chip').nth(2).click(); // deselect 判断
    await page.evaluate(() => { S.skipCorrect=true; saveSetup(); updateCountUI(getFilteredQuestions().length); });
    await page.waitForTimeout(50);
    await page.locator('#btnStart').click();
    await expect(page.locator('#toast')).toBeVisible();
    await expect(page.locator('#toast')).toContainText('已刷完');
  });

  test('skip correct toggle persists across reload', async ({ page }) => {
    await page.evaluate(() => { S.skipCorrect=true; saveSetup(); });
    await page.reload();
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    await goSetup(page);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => S.skipCorrect)).toBe(true);
  });

  test('setup state persists after quiz and re-enter', async ({ page }) => {
    // Select 高等教育心理学 + 多选 + 顺序出题
    await page.locator('#subjectChips .chip').nth(2).click(); // psych
    await page.locator('#typeChips .chip').nth(1).click(); // deselect 多选 (keep only 单选/判断)
    await page.locator('#typeChips .chip').nth(2).click(); // deselect 判断 (keep only 单选)
    await page.locator('#countChips .chip').nth(1).click(); // 顺序刷题
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    // Answer one question
    await answerCurrent(page);
    await page.locator('#btnNext').click();
    await page.waitForTimeout(80);
    // Back to setup
    await page.locator('#btnBack').click();
    await page.waitForTimeout(80);
    // Verify subject is still psych
    expect(await page.evaluate(() => S.subject)).toBe('psych');
    expect(await page.evaluate(() => S.types)).toEqual(['单选']);
    expect(await page.evaluate(() => S.countMode)).toBe('sequential');
    // Go home and re-enter via 开始刷题
    await page.locator('#btnBack').click();
    await page.waitForTimeout(50);
    await page.locator('#btnStartQuiz').click();
    await page.waitForTimeout(80);
    // Verify setup state preserved
    expect(await page.evaluate(() => S.subject)).toBe('psych');
    expect(await page.evaluate(() => S.types)).toEqual(['单选']);
    expect(await page.evaluate(() => S.countMode)).toBe('sequential');
  });
});

// ──────────────────────────────────────────────
// QUIZ — RANDOM MODE
// ──────────────────────────────────────────────
test.describe('Quiz - Random Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/index.html');
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    await resetApp(page);
    await goSetup(page);
  });

  test('starts quiz and renders question', async ({ page }) => {
    await page.locator('#countChips .chip').nth(0).click(); // random
    await page.locator('#countInput').fill('5');
    await page.locator('#btnStart').click();
    await expect(page.locator('#page-quiz')).toHaveClass(/active/);
    await expect(page.locator('#qTypeBadge')).toBeVisible();
    await expect(page.locator('.question-text')).toBeVisible();
    await expect(page.locator('#qProgress')).toContainText('1/5');
  });

  test('correct answer shows feedback and updates history', async ({ page }) => {
    await page.locator('#countChips .chip').nth(0).click();
    await page.locator('#countInput').fill('3');
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    const info = await page.evaluate(() => {
      const q = S.quizQ[S.qIdx];
      return { multi: q.type === '多选', answer: q.answer, opts: Object.keys(q.options || {}), num: q.num, subject: q.subject, type: q.type };
    });
    // answer
    if (info.multi) {
      await clickOpt(page, info.opts[0]);
      await page.locator('#btnSubmitMulti').click();
    } else {
      await clickOpt(page, info.answer);
    }
    await page.waitForTimeout(100);
    await expect(page.locator('.feedback')).toHaveClass(/show/);
    // history updated
    const h = await page.evaluate(() => historyMap);
    const hk = `${info.subject}-${info.num}-${info.type}`;
    expect(h[hk]).toBeDefined();
    expect(h[hk].count).toBe(1);
  });

  test('wrong answer adds to wrong set', async ({ page }) => {
    await page.locator('#countChips .chip').nth(0).click();
    await page.locator('#countInput').fill('3');
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    const info = await page.evaluate(() => {
      const q = S.quizQ[S.qIdx];
      if (q.type === '多选') return { multi: true, answer: q.answer, opts: Object.keys(q.options || {}), num: q.num, subject: q.subject, type: q.type };
      // pick a wrong answer
      const wrong = q.answer === 'A' ? 'B' : 'A';
      return { multi: false, wrong, num: q.num, subject: q.subject, type: q.type };
    });
    if (info.multi) {
      // just pick wrong subset (select one wrong option)
      const wrongOpt = info.opts.find(o => !info.answer.includes(o)) || info.opts[0];
      await page.locator(`.option-btn[data-label="${wrongOpt}"]`).click();
      await page.locator('#btnSubmitMulti').click();
    } else {
      await page.locator(`.option-btn[data-label="${info.wrong}"]`).click();
    }
    await page.waitForTimeout(100);
    // check wrong map
    const wm = await page.evaluate(() => wrongMap);
    const key = `${info.subject}-${info.num}-${info.type}`;
    if (!info.multi) {
      // For single/judge, wrong answer was given
      expect(wm[key]).toBeDefined();
      expect(wm[key].userAnswer).toBe(info.wrong);
    }
    // feedback shows
    await expect(page.locator('.feedback').first()).toBeVisible();
  });

  test('next button advances to next question', async ({ page }) => {
    await page.locator('#countChips .chip').nth(0).click();
    await page.locator('#countInput').fill('3');
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    // Answer first question using evaluate to handle all types
    await answerCurrent(page);
    await page.waitForTimeout(80);
    await page.locator('#btnNext').click();
    await page.waitForTimeout(80);
    await expect(page.locator('#qProgress')).toContainText('2/3');
  });

  test('last question leads to result', async ({ page }) => {
    await page.locator('#countChips .chip').nth(0).click();
    await page.locator('#countInput').fill('2');
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    for (let i = 0; i < 2; i++) {
      await answerCurrent(page);
      await page.waitForTimeout(100);
      await page.locator('#btnNext').waitFor({ state: 'visible', timeout: 3000 });
      await page.locator('#btnNext').click();
      await page.waitForTimeout(80);
    }
    await expect(page.locator('#page-result')).toHaveClass(/active/);
  });
});

// ──────────────────────────────────────────────
// QUIZ — MULTI-CHOICE
// ──────────────────────────────────────────────
test.describe('Quiz - Multi Choice', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/index.html');
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    await resetApp(page);
    await page.evaluate(() => { window.showView('setup'); renderSetup(); S.subject = 'edu'; S.types = ['多选']; });
    await page.waitForTimeout(50);
  });

  test('select multiple options and submit', async ({ page }) => {
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    const info = await page.evaluate(() => {
      const q = S.quizQ[0]; return { answer: q.answer, opts: Object.keys(q.options || {}) };
    });
    for (const o of info.opts) await page.locator(`.option-btn[data-label="${o}"]`).click();
    await page.locator('#btnSubmitMulti').click();
    await page.waitForTimeout(100);
    await expect(page.locator('.feedback')).toBeVisible();
  });

  test('correct multi-choice highlights all selected options', async ({ page }) => {
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    const info = await page.evaluate(() => {
      const q = S.quizQ[0]; return { answer: q.answer, opts: Object.keys(q.options || {}) };
    });
    // Select all correct options
    for (const o of info.answer.split('')) await page.locator(`.option-btn[data-label="${o}"]`).click();
    await page.locator('#btnSubmitMulti').click();
    await page.waitForTimeout(100);
    // All correct options should have .correct class
    for (const o of info.answer.split(''))
      await expect(page.locator(`.option-btn[data-label="${o}"]`)).toHaveClass(/correct/);
  });

  test('wrong multi-choice marks missed correct options', async ({ page }) => {
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    const info = await page.evaluate(() => {
      const q = S.quizQ[0]; return { answer: q.answer, opts: Object.keys(q.options || {}) };
    });
    // Select only first correct option (incomplete → wrong)
    const correctOpts = info.answer.split('');
    const sel = correctOpts[0];
    const missed = correctOpts.filter(o => o !== sel);
    await page.locator(`.option-btn[data-label="${sel}"]`).click();
    await page.locator('#btnSubmitMulti').click();
    await page.waitForTimeout(100);
    await expect(page.locator(`.option-btn[data-label="${sel}"]`)).toHaveClass(/wrong/);
    for (const o of missed)
      await expect(page.locator(`.option-btn[data-label="${o}"]`)).toHaveClass(/show-correct/);
  });

  test('cannot submit without selection', async ({ page }) => {
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    await page.locator('#btnSubmitMulti').click();
    await expect(page.locator('#toast')).toHaveClass(/show/);
  });
});

// ──────────────────────────────────────────────
// QUIZ — TRUE/FALSE
// ──────────────────────────────────────────────
test.describe('Quiz - Judge', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/index.html');
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    await resetApp(page);
    await page.evaluate(() => { window.showView('setup'); renderSetup(); S.subject = 'psych'; S.types = ['判断']; });
    await page.waitForTimeout(50);
  });

  test('shows 正确/错误 buttons', async ({ page }) => {
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    await expect(page.locator('.option-btn')).toHaveCount(2);
    await expect(page.locator('.option-btn').nth(0)).toContainText('正确');
    await expect(page.locator('.option-btn').nth(1)).toContainText('错误');
  });

  test('correct answer shows feedback', async ({ page }) => {
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    await answerCurrent(page);
    await page.waitForTimeout(100);
    await expect(page.locator('.feedback').first()).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// QUIZ — SEQUENTIAL MODE
// ──────────────────────────────────────────────
test.describe('Quiz - Sequential', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/index.html');
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    await resetApp(page);
    await goSetup(page);
    await page.locator('#subjectChips .chip').nth(1).click(); // edu
    await page.locator('#typeChips .chip').nth(1).click(); // deselect 多选
    await page.locator('#typeChips .chip').nth(2).click(); // deselect 判断
    await page.locator('#countChips .chip').nth(1).click(); // sequential
    await page.locator('#seqCountInput').fill('3');
  });

  test('questions in order by num', async ({ page }) => {
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    expect(await page.evaluate(() => S.quizQ[0].num)).toBe(1);
  });

  test('saves progress after answering', async ({ page }) => {
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    const ans = await page.evaluate(() => Object.keys(S.quizQ[0].options)[0]);
    await page.locator(`.option-btn[data-label="${ans}"]`).click();
    await page.waitForTimeout(100);
    const progKey = await page.evaluate(() => getSeqKey());
    const prog = await getLS(page, progKey);
    expect(prog).not.toBeNull();
    expect(prog.position).toBeGreaterThan(0);
  });

  test('continues from saved position', async ({ page }) => {
    // Answer two questions in first session
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    await answerCurrent(page);
    await page.waitForTimeout(80);
    await page.locator('#btnNext').click();
    await page.waitForTimeout(80);
    await answerCurrent(page);
    await page.waitForTimeout(80);
    await page.locator('#btnNext').click();
    await page.waitForTimeout(80);

    // Go back and start another session — should continue from position 2
    await goSetup(page);
    // S.subject and S.types persist from beforeEach (edu + 单选)
    await page.locator('#countChips .chip').nth(1).click(); // sequential
    await page.locator('#seqCountInput').fill('3');
    await page.locator('#btnStart').click();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => S.quizQ[0].num)).toBe(3);
  });
});

// ──────────────────────────────────────────────
// RESULT PAGE
// ──────────────────────────────────────────────
test.describe('Result Page', () => {
  test('shows correct summary after quiz', async ({ page }) => {
    await page.goto('http://localhost:8080/index.html');
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    await resetApp(page);
    await page.evaluate(() => { window.showView('setup'); renderSetup(); S.subject = 'edu'; S.types = ['单选']; });
    await page.locator('#countChips .chip').nth(0).click(); // random
    await page.locator('#countInput').fill('3');
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    const total = await page.evaluate(() => S.quizQ.length);
    for (let i = 0; i < total; i++) {
      await answerCurrent(page);
      await page.waitForTimeout(80);
      await page.locator('#btnNext').waitFor({ state: 'visible', timeout: 3000 });
      await page.locator('#btnNext').click();
      await page.waitForTimeout(80);
    }
    await expect(page.locator('#page-result')).toHaveClass(/active/);
    await expect(page.locator('#resultScore')).toBeVisible();
    await expect(page.locator('#resultTotal')).toBeVisible();
    const cw = await page.evaluate(() => ({ c: S.correctCount, w: S.wrongCount }));
    expect(cw.c + cw.w).toBe(total);
  });
});

// ──────────────────────────────────────────────
// WRONG QUESTIONS
// ──────────────────────────────────────────────
test.describe('Wrong Questions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/index.html');
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    await resetApp(page);
    await page.evaluate(() => {
      wrongMap = { 'edu-1-单选': { userAnswer: 'B', time: Date.now() }, 'edu-5-多选': { userAnswer: 'C', time: Date.now() - 1000 }, 'psych-3-判断': { userAnswer: 'A', time: Date.now() - 2000 } };
      saveWrong();
    });
    await goTo(page, 'wrong');
  });

  test('shows all 3 wrong questions', async ({ page }) => {
    await expect(page.locator('.wrong-item')).toHaveCount(3);
  });

  test('filters by edu subject', async ({ page }) => {
    await page.locator('#wrongFilter .chip').nth(1).click();
    await page.waitForTimeout(50);
    await expect(page.locator('.wrong-item')).toHaveCount(2);
  });

  test('filters by psych subject', async ({ page }) => {
    await page.locator('#wrongFilter .chip').nth(2).click();
    await page.waitForTimeout(50);
    await expect(page.locator('.wrong-item')).toHaveCount(1);
  });

  test('remove a single wrong question', async ({ page }) => {
    await page.locator('.btn-remove').first().click();
    await page.waitForTimeout(50);
    await expect(page.locator('.wrong-item')).toHaveCount(2);
  });

  test('empty state when no wrong questions', async ({ page }) => {
    await page.evaluate(() => { wrongMap = {}; saveWrong(); });
    await goTo(page, 'wrong');
    await expect(page.locator('.wrong-empty')).toBeVisible();
  });

  test('clear all removes everything', async ({ page }) => {
    await page.locator('#btnClearWrong').click();
    await page.locator('#confirmDanger').click();
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => Object.keys(wrongMap).length)).toBe(0);
  });

  test('practice starts quiz with wrong questions', async ({ page }) => {
    await page.locator('#btnPracticeWrong').click();
    await page.waitForTimeout(80);
    await expect(page.locator('#page-quiz')).toHaveClass(/active/);
    expect(await page.evaluate(() => S.quizQ.length)).toBe(3);
  });

  test('back from wrong practice returns to wrong', async ({ page }) => {
    await page.locator('#btnPracticeWrong').click();
    await page.waitForTimeout(80);
    await page.locator('#btnBack').click();
    await page.waitForTimeout(50);
    await expect(page.locator('#page-wrong')).toHaveClass(/active/);
  });

  test('buttons visible after visiting favorites first', async ({ page }) => {
    // Visit favorites page first (which previously polluted the DOM with .wrong-actions class)
    await goTo(page, 'fav');
    await page.waitForTimeout(50);
    // Then go to wrong page
    await goTo(page, 'wrong');
    await page.evaluate(() => renderWrong());
    await page.waitForTimeout(50);
    // Buttons should still be visible
    await expect(page.locator('#btnClearWrong')).toBeVisible();
    await expect(page.locator('#btnPracticeWrong')).toBeVisible();
  });
});

// ──────────────────────────────────────────────
// FAVORITES
// ──────────────────────────────────────────────
test.describe('Favorites', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/index.html');
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    await resetApp(page);
    await page.evaluate(() => {
      favMap = { 'edu-1-单选': { time: Date.now() }, 'psych-5-判断': { time: Date.now() - 1000 } };
      saveFav();
    });
    await goTo(page, 'fav');
  });

  test('shows 2 favorited questions', async ({ page }) => {
    await expect(page.locator('.wrong-item')).toHaveCount(2);
  });

  test('remove a favorite', async ({ page }) => {
    await page.locator('.btn-remove').first().click();
    await page.waitForTimeout(50);
    await expect(page.locator('.wrong-item')).toHaveCount(1);
  });

  test('empty state', async ({ page }) => {
    await page.evaluate(() => { favMap = {}; saveFav(); });
    await goTo(page, 'fav');
    await expect(page.locator('.wrong-empty')).toBeVisible();
  });

  test('practice starts quiz with favorited questions', async ({ page }) => {
    await page.locator('#btnPracticeFav').click();
    await page.waitForTimeout(80);
    await expect(page.locator('#page-quiz')).toHaveClass(/active/);
    expect(await page.evaluate(() => S.quizQ.length)).toBe(2);
  });

  test('back from fav practice returns to fav', async ({ page }) => {
    await page.locator('#btnPracticeFav').click();
    await page.waitForTimeout(80);
    await page.locator('#btnBack').click();
    await page.waitForTimeout(50);
    await expect(page.locator('#page-fav')).toHaveClass(/active/);
  });
});

// ──────────────────────────────────────────────
// HISTORY PAGE
// ──────────────────────────────────────────────
test.describe('History Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/index.html');
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    await page.evaluate(() => {
      // Start fresh
      localStorage.removeItem('q2p_h');
      historyMap = {
        'edu-1-单选': { count: 3, correct: 2 },
        'edu-2-多选': { count: 1, correct: 0 },
        'psych-10-判断': { count: 5, correct: 5 },
      };
      saveHistory();
    });
    await goTo(page, 'history');
  });

  test('shows stats summary', async ({ page }) => {
    await expect(page.locator('#historySummary')).toBeVisible();
    await expect(page.locator('#historySummary')).toContainText('3'); // attempted count
  });

  test('shows question items', async ({ page }) => {
    const items = page.locator('.history-item');
    await expect(items).not.toHaveCount(0);
  });

  test('subject filter shows correct group counts', async ({ page }) => {
    // subject filter defaults to "全部" — shows all 973
    await expect(page.locator('.history-item')).not.toHaveCount(0);
    // edu filter shows 472 edu questions
    await page.locator('#historySubjFilter .chip').nth(1).click(); // 高等教育学
    await page.waitForTimeout(80);
    const eduCount = await page.locator('.history-item').count();
    expect(eduCount).toBe(472);
    // psych filter shows 501 psych questions
    await page.locator('#historySubjFilter .chip').nth(2).click();
    await page.waitForTimeout(80);
    const psychCount = await page.locator('.history-item').count();
    expect(psychCount).toBe(501);
  });

  test('status filter shows only attempted questions', async ({ page }) => {
    await page.locator('#historyStatusFilter .chip').nth(1).click(); // 已刷
    await page.waitForTimeout(80);
    const done = await page.locator('.history-item').count();
    expect(done).toBe(3);
  });

  test('未刷 filter combined with 已刷 = total', async ({ page }) => {
    await page.locator('#historyStatusFilter .chip').nth(2).click(); // 未刷
    await page.waitForTimeout(80);
    const undone = await page.locator('.history-item').count();
    await page.locator('#historyStatusFilter .chip').nth(1).click(); // 已刷
    await page.waitForTimeout(80);
    const done = await page.locator('.history-item').count();
    expect(undone + done).toBe(973);
  });

  test('click item starts single-question quiz', async ({ page }) => {
    await page.locator('#historySubjFilter .chip').nth(1).click(); // edu
    await page.waitForTimeout(50);
    await page.locator('.history-item').first().click();
    await page.waitForTimeout(80);
    await expect(page.locator('#page-quiz')).toHaveClass(/active/);
    expect(await page.evaluate(() => S.quizQ.length)).toBe(1);
    expect(await page.evaluate(() => S.fromHistory)).toBe(true);
  });

  test('back from single-question returns to history', async ({ page }) => {
    await page.locator('#historySubjFilter .chip').nth(1).click();
    await page.waitForTimeout(50);
    await page.locator('.history-item').first().click();
    await page.waitForTimeout(80);
    const a = await page.evaluate(() => Object.keys(S.quizQ[0].options)[0]);
    await page.locator(`.option-btn[data-label="${a}"]`).click();
    await page.waitForTimeout(80);
    await page.locator('#btnNext').click();
    await page.waitForTimeout(80);
    await expect(page.locator('#page-history')).toHaveClass(/active/);
  });

  test('single question quiz does not corrupt countMode', async ({ page }) => {
    // Set up sequential mode in setup
    await page.evaluate(() => { S.countMode = 'sequential'; saveSetup(); });
    // Click a history item to start single-question quiz
    await page.locator('.history-item').first().click();
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => S.countMode)).toBe('random'); // quiz overrides
    // Exit quiz via next button
    await answerCurrent(page);
    await page.locator('#btnNext').click();
    await page.waitForTimeout(80);
    // countMode should be restored
    expect(await page.evaluate(() => S.countMode)).toBe('sequential');
    // Go to setup and verify persistence
    await goTo(page, 'home');
    await page.locator('#btnStartQuiz').click();
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => S.countMode)).toBe('sequential');
  });
});

// ──────────────────────────────────────────────
// PERSISTENCE
// ──────────────────────────────────────────────
test.describe('Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/index.html');
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    await resetApp(page);
  });

  test('wrong questions survive reload', async ({ page }) => {
    await page.evaluate(() => { wrongMap = { 'edu-1-单选': { userAnswer: 'B', time: Date.now() } }; saveWrong(); });
    await page.reload();
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    const wm = await page.evaluate(() => { loadWrong(); return wrongMap; });
    expect(wm['edu-1-单选']).toBeDefined();
    expect(wm['edu-1-单选'].userAnswer).toBe('B');
  });

  test('old wrong format migrates to new key', async ({ page }) => {
    // Simulate old deployment: key is 'subj-num' without type
    await page.evaluate(() => { localStorage.setItem('q2p_wrong', JSON.stringify({ 'edu-1': { userAnswer: 'B', time: Date.now() } })); });
    await page.reload();
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    const wm = await page.evaluate(() => wrongMap);
    // Old key should be gone, new key should exist
    expect(wm['edu-1']).toBeUndefined();
    const newKey = Object.keys(wm).find(k => k.startsWith('edu-1-'));
    expect(newKey).toBeDefined();
    expect(wm[newKey].userAnswer).toBe('B');
  });

  test('history survives reload', async ({ page }) => {
    await page.evaluate(() => { historyMap = { 'edu-5-单选': { count: 3, correct: 2 } }; saveHistory(); });
    await page.reload();
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    const h = await page.evaluate(() => { loadHistory(); return historyMap; });
    expect(h['edu-5-单选']).toBeDefined();
    expect(h['edu-5-单选'].count).toBe(3);
  });

  test('old history format migrates to new key', async ({ page }) => {
    // Simulate old deployment: key is 'subj-num' without type
    await page.evaluate(() => { localStorage.setItem('q2p_h', JSON.stringify({ 'edu-5': { count: 3, correct: 2 } })); });
    await page.reload();
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    const h = await page.evaluate(() => historyMap);
    // Old key should be gone, new key should exist
    expect(h['edu-5']).toBeUndefined();
    const newKey = Object.keys(h).find(k => k.startsWith('edu-5-'));
    expect(newKey).toBeDefined();
    expect(h[newKey].count).toBe(3);
    expect(h[newKey].correct).toBe(2);
  });

  test('favorites survive reload', async ({ page }) => {
    await page.evaluate(() => { favMap = { 'edu-1-单选': { time: Date.now() } }; saveFav(); });
    await page.reload();
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    const f = await page.evaluate(() => { loadFav(); return favMap; });
    expect(f['edu-1-单选']).toBeDefined();
  });

  test('sequential progress survives reload', async ({ page }) => {
    await page.evaluate(() => {
      S.subject = 'edu'; S.types = ['单选'];
      localStorage.setItem(getSeqKey(), JSON.stringify({ position: 50, total: 304, updated: Date.now() }));
    });
    await page.reload();
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    const prog = await page.evaluate(() => { S.subject = 'edu'; S.types = ['单选']; return getSeqProgress(); });
    expect(prog).not.toBeNull();
    expect(prog.position).toBe(50);
  });
});

// ──────────────────────────────────────────────
// EDGE CASES
// ──────────────────────────────────────────────
test.describe('Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/index.html');
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    await resetApp(page);
    await goSetup(page);
  });

  test('back from quiz goes to setup', async ({ page }) => {
    await page.locator('#btnStart').click();
    await page.waitForTimeout(80);
    await page.locator('#btnBack').click();
    await page.waitForTimeout(50);
    await expect(page.locator('#page-setup')).toHaveClass(/active/);
  });

  test('sequential progress accumulates', async ({ page }) => {
    await page.locator('#subjectChips .chip').nth(1).click(); // edu
    await page.locator('#typeChips .chip').nth(1).click(); // deselect 多选
    await page.locator('#typeChips .chip').nth(2).click(); // deselect 判断
    await page.locator('#countChips .chip').nth(1).click(); // sequential
    await page.locator('#seqCountInput').fill('2');
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    // Answer 2 questions
    for (let i = 0; i < 2; i++) {
      await answerCurrent(page);
      await page.waitForTimeout(80);
      await page.locator('#btnNext').waitFor({ state: 'visible', timeout: 3000 });
      await page.locator('#btnNext').click();
      await page.waitForTimeout(80);
    }
    // Start another session — should continue from position 2
    await goSetup(page);
    // S.subject and S.types persist from above (edu + 单选)
    await page.locator('#countChips .chip').nth(1).click(); // sequential
    await page.locator('#seqCountInput').fill('2');
    await page.locator('#btnStart').click();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => S.quizQ[0].num)).toBe(3);
  });

  test('wrong practice does not affect sequential progress', async ({ page }) => {
    // Setup sequential mode
    await page.locator('#subjectChips .chip').nth(1).click(); // edu
    await page.locator('#typeChips .chip').nth(1).click(); // deselect 多选
    await page.locator('#typeChips .chip').nth(2).click(); // deselect 判断
    await page.locator('#countChips .chip').nth(1).click(); // sequential
    await page.locator('#seqCountInput').fill('3');
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    // Answer first question
    await answerCurrent(page);
    await page.waitForTimeout(80);
    const seqPosAfterSeq = await page.evaluate(() => JSON.parse(localStorage.getItem('seq_edu_单选')||'{}').position);
    expect(seqPosAfterSeq).toBe(1);
    // Go home first
    await page.locator('#btnBack').click();
    await page.waitForTimeout(50);
    await goTo(page, 'home');
    await page.waitForTimeout(50);
    await page.evaluate(() => { wrongMap['edu-2-单选'] = { userAnswer: 'A', time: Date.now() }; saveWrong(); });
    await page.locator('#btnWrongReview').click();
    await page.waitForSelector('#page-wrong');
    await page.locator('#btnPracticeWrong').click();
    await page.waitForSelector('.question-text');
    await answerCurrent(page);
    await page.waitForTimeout(80);
    // Sequential progress must NOT be affected
    const seqPosAfterWrong = await page.evaluate(() => JSON.parse(localStorage.getItem('seq_edu_单选')||'{}').position);
    expect(seqPosAfterWrong).toBe(1);
  });

  test('correct answer removes from wrong set', async ({ page }) => {
    // Pre-set a wrong question
    await page.evaluate(() => { wrongMap['edu-1-单选'] = { userAnswer: 'A', time: Date.now() }; saveWrong(); });
    // Start edu + 单选 all mode
    await page.locator('#subjectChips .chip').nth(1).click(); // edu
    await page.locator('#typeChips .chip').nth(1).click(); // deselect 多选
    await page.locator('#typeChips .chip').nth(2).click(); // deselect 判断
    await page.locator('#countInput').fill('500');
    await page.locator('#btnStart').click();
    await page.waitForSelector('.question-text');
    // Navigate to edu-1 and re-render
    const found = await page.evaluate(() => {
      const idx = S.quizQ.findIndex(q => q.subject === 'edu' && q.num === 1);
      if (idx >= 0) { S.qIdx = idx; renderQuestion(); return true; }
      return false;
    });
    test.skip(!found, 'edu-1 not in quiz set');
    await page.waitForTimeout(80);
    await answerCurrent(page);
    await page.waitForTimeout(80);
    const stillWrong = await page.evaluate(() => wrongMap['edu-1-单选']);
    expect(stillWrong).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// NAVIGATION FLOW
// ──────────────────────────────────────────────
test.describe('Navigation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080/index.html');
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    await resetApp(page);
  });

  test('home -> setup -> quiz -> result -> home', async ({ page }) => {
    await expect(page.locator('#page-home')).toHaveClass(/active/);
    await page.locator('#btnStartQuiz').click();
    await expect(page.locator('#page-setup')).toHaveClass(/active/);
    // start quiz with small random count
    await page.locator('#countChips .chip').nth(0).click(); // random
    await page.locator('#countInput').fill('3');
    await page.locator('#btnStart').click();
    await expect(page.locator('#page-quiz')).toHaveClass(/active/);
    // Answer all questions
    const total = await page.evaluate(() => S.quizQ.length);
    for (let i = 0; i < total; i++) {
      await answerCurrent(page);
      await page.waitForTimeout(100);
      await page.locator('#btnNext').waitFor({ state: 'visible', timeout: 3000 });
      await page.locator('#btnNext').click();
      await page.waitForTimeout(80);
    }
    await expect(page.locator('#page-result')).toHaveClass(/active/);
    await page.locator('#btnBackHome').click();
    await expect(page.locator('#page-home')).toHaveClass(/active/);
  });

  test('home -> wrong -> home', async ({ page }) => {
    await page.locator('#btnWrongReview').click();
    await expect(page.locator('#page-wrong')).toHaveClass(/active/);
    await page.locator('#btnBack').click();
    await expect(page.locator('#page-home')).toHaveClass(/active/);
  });

  test('home -> history -> home', async ({ page }) => {
    await page.locator('#btnHistory').click();
    await expect(page.locator('#page-history')).toHaveClass(/active/);
    await page.locator('#btnBack').click();
    await expect(page.locator('#page-home')).toHaveClass(/active/);
  });

  test('home -> fav -> home', async ({ page }) => {
    await page.locator('#btnFav').click();
    await expect(page.locator('#page-fav')).toHaveClass(/active/);
    await page.locator('#btnBack').click();
    await expect(page.locator('#page-home')).toHaveClass(/active/);
  });
});

// ──────────────────────────────────────────────
// PERFORMANCE
// ──────────────────────────────────────────────
test.describe('Performance', () => {
  test('no JSON fetch requests', async ({ page }) => {
    const urls = [];
    page.on('request', req => { if (req.url().endsWith('.json')) urls.push(req.url()); });
    await page.goto('http://localhost:8080/index.html');
    await page.waitForFunction(() => typeof allQuestions !== 'undefined' && allQuestions.length > 0);
    const jsonFetches = urls.filter(u => u.includes('edu_quiz_data') || u.includes('psych_quiz_data'));
    expect(jsonFetches.length).toBe(0);
  });
});
