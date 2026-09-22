import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>localStorage.removeItem('flowdesk-sla-v1'));
});

test.describe('服务时限与值班交接台',()=>{

 test('缺值班组或时限非正数 → 整批拒绝，列出节点',async({page})=>{
  await page.goto('/workflows/wf-4'); // IT 服务请求（draft，审批节点已带值班组）
  // 先清空值班组、把时限改成 0
  await page.getByTestId('canvas-node-approval').click();
  await page.getByLabel('值班组').selectOption({index:0});
  await page.getByLabel('服务时限（工作分钟）').fill('0');
  await page.getByTestId('publish-button').click();
  await expect(page.getByTestId('issues-panel')).toContainText('未配置值班组');
  await expect(page.getByTestId('issues-panel')).toContainText('服务时限必须为正数');
  await expect(page.getByTestId('issues-panel')).toContainText('直属主管审批');
  await expect(page.getByRole('status')).toContainText('发布被拒绝');
  // 整批拒绝：版本号不增加
  await expect(page.locator('.draft-indicator')).toContainText('v1');
 });

 test('同组班次重叠 → 整批拒绝并列出冲突班次',async({page})=>{
  await page.goto('/workflows/wf-5'); // 用印申请引用了「综合应急值班组」（周三 10:00-12:00 与早班重叠）
  await page.getByTestId('publish-button').click();
  await expect(page.getByTestId('issues-panel')).toContainText('班次重叠');
  await expect(page.locator('.conflict-list li').first()).toContainText('应急早班');
  await expect(page.locator('.conflict-list li').first()).toContainText('应急连班');
  await expect(page.locator('.conflict-list li').first()).toContainText('周三');
  await expect(page.getByRole('status')).toContainText('发布被拒绝');
 });

 test('发布冻结快照：运行中实例用旧快照，新实例用新规则，交接剩余连续',async({page})=>{
  await page.goto('/desk');
  // 存在三个 live 任务，都持有 v2 旧快照
  await expect(page.getByTestId('task-card')).toHaveCount(3);
  const firstTask=page.getByTestId('task-card').filter({hasText:'INS-2026-LIVE-1'});
  await expect(firstTask).toContainText('v2');
  await expect(firstTask).toContainText('财务审批组');

  // 读取交接前剩余（data-remaining 为工作分钟整数）
  const before=Number(await firstTask.getByTestId('sla-remaining').getAttribute('data-remaining'));
  expect(before).toBeGreaterThan(200); // 360 时限、已用约 75

  // 登记交接：剩余时限连续不变
  await firstTask.getByTestId('handover-btn').click();
  await expect(firstTask.getByTestId('handover-log')).toContainText('剩余时限连续');
  const after=Number(await firstTask.getByTestId('sla-remaining').getAttribute('data-remaining'));
  expect(Math.abs(after-before)).toBeLessThanOrEqual(1);
  await expect(firstTask).toContainText('规则快照');

  // 修改 wf-1 时限为 600 分钟后发布 → 冻结为 v3（先补上该流程刻意留空的条件规则）
  await page.goto('/workflows/wf-1');
  await page.getByTestId('canvas-node-condition').click();
  await page.getByLabel('条件字段').selectOption('amount');
  await page.getByLabel('条件比较值').fill('5000');
  await page.getByTestId('canvas-node-approval').click();
  await page.getByLabel('服务时限（工作分钟）').fill('600');
  await page.getByTestId('publish-button').click();
  await expect(page.getByRole('status')).toContainText('快照已冻结');

  // 运行中实例仍是 v2 旧快照
  await page.goto('/desk');
  const oldTask=page.getByTestId('task-card').filter({hasText:'INS-2026-LIVE-1'});
  await expect(oldTask).toContainText('v2');

  // 发起的新实例使用 v3 新规则（600 分钟 = 10 小时）
  await page.getByTestId('launch-instance').filter({hasText:'差旅费用审批'}).click();
  const newTask=page.getByTestId('task-card').filter({hasText:'INS-2026-NEW'});
  await expect(newTask).toContainText('v3');
  await expect(newTask).toContainText('10 小时');
 });

 test('暂停日历与值班组在交接台可见',async({page})=>{
  await page.goto('/desk');
  await expect(page.getByText('综合应急值班组').first()).toBeVisible();
  await expect(page.getByTestId('group-conflict')).toContainText('应急早班');
  await expect(page.getByText('公司公共暂停日历').first()).toBeVisible();
  await expect(page.getByText('国庆节全天暂停').first()).toBeVisible();
 });

 test('刷新后配置、快照与剩余时限保持一致',async({page})=>{
  await page.goto('/desk');
  const task=page.getByTestId('task-card').filter({hasText:'INS-2026-LIVE-2'});
  await expect(task).toContainText('采购审批组');
  const r1=await task.getByTestId('sla-remaining').getAttribute('data-remaining');
  await page.reload();
  const r2=await page.getByTestId('task-card').filter({hasText:'INS-2026-LIVE-2'}).getByTestId('sla-remaining').getAttribute('data-remaining');
  expect(Math.abs(Number(r1)-Number(r2))).toBeLessThanOrEqual(1);
 });

 test('暂停日历不计时：实例详情展示冻结快照',async({page})=>{
  await page.goto('/monitor');
  await page.getByRole('button',{name:'进行中',exact:true}).click();
  await page.getByTestId('instance-row').filter({hasText:'INS-2026-LIVE-1'}).click();
  await expect(page.getByTestId('sla-card')).toContainText('冻结快照 v2');
  await expect(page.getByTestId('sla-card')).toContainText('公司公共暂停日历');
  await expect(page.getByTestId('sla-card')).toContainText('财务审批组');
 });
});
