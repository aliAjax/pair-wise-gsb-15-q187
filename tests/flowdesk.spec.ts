import {test,expect} from '@playwright/test';
test.describe.serial('FlowDesk 完整链路',()=>{
 test('Dashboard KPI 与最近流程进入编辑器',async({page})=>{await page.goto('/');await expect(page.getByTestId('kpi-grid')).toBeVisible();await expect(page.getByText('流程总数')).toBeVisible();await expect(page.getByText('异常实例',{exact:true}).first()).toBeVisible();await page.getByTestId('recent-workflow').first().click();await expect(page.getByTestId('flow-canvas')).toBeVisible();});
 test('审批配置、保存和双区域校验',async({page})=>{await page.goto('/workflows/wf-1');await page.getByTestId('canvas-node-approval').click();await expect(page.getByTestId('config-panel')).toContainText('审批配置');await page.getByLabel('审批人来源').selectOption({label:'固定角色'});await page.getByTestId('save-node-config').click();await page.getByRole('button',{name:'保存草稿'}).click();await page.getByTestId('validate-button').click();await expect(page.getByTestId('canvas-node-condition')).toHaveClass(/invalid/);await expect(page.getByTestId('issues-panel')).toContainText('条件分支规则未配置');const before=await page.getByTestId('error-count').textContent();expect(Number(before?.match(/\d+/)?.[0])).toBeGreaterThan(0);await page.getByTestId('canvas-node-condition').click();await page.getByLabel('条件字段').selectOption('amount');await page.getByLabel('条件比较值').fill('5000');await page.getByTestId('save-node-config').click();await page.getByTestId('validate-button').click();await expect(page.getByTestId('error-count')).toContainText('0 错误');});
 test('表单预览金额驱动条件分支',async({page})=>{await page.goto('/workflows/wf-1/preview');await expect(page.getByTestId('branch-result')).toContainText('标准分支');await page.getByLabel('申请金额').fill('12000');await expect(page.getByTestId('branch-result')).toContainText('高额分支');});
 test('发布后列表和总览同步',async({page})=>{await page.goto('/workflows/wf-2');await page.getByTestId('publish-button').click();await expect(page.getByRole('status')).toContainText('发布成功');await page.getByRole('link',{name:'流程管理'}).click();const row=page.getByTestId('workflow-row').filter({hasText:'采购合同审批'});await expect(row).toContainText('已发布');await expect(row).toContainText('v3');await page.getByRole('link',{name:'总览'}).click();await expect(page.getByTestId('kpi-grid')).toBeVisible();});
 test('异常实例详情、时间线与当前节点高亮',async({page})=>{await page.goto('/monitor');await page.getByRole('button',{name:'异常',exact:true}).click();await page.getByTestId('instance-row').first().click();await expect(page.getByTestId('instance-detail')).toBeVisible();await expect(page.getByTestId('execution-timeline')).toContainText('提交申请');await expect(page.locator('.runtime-highlight')).toHaveCount(1);});
 test('版本比较并恢复历史版本',async({page})=>{await page.goto('/workflows/wf-2/versions');await expect(page.getByTestId('version-compare')).toContainText('新增节点');await page.getByTestId('restore-version').click();await expect(page).toHaveURL(/\/workflows\/wf-2$/);await expect(page.getByRole('status')).toContainText('已恢复');await expect(page.getByTestId('flow-canvas')).toBeVisible();});
});

test('1440px 桌面视觉与控制台验证',async({page})=>{
 const errors:string[]=[]; page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 for(const path of ['/','/workflows/wf-1','/monitor']){await page.goto(path);await page.waitForTimeout(250);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);expect(overflow,`${path} 不应横向溢出`).toBeFalsy()}
 await page.goto('/'); await page.screenshot({path:'test-results/dashboard-1440.png',fullPage:true});
 expect(errors,'浏览器 console 不应出现 error').toEqual([]);
});

test.describe.serial('服务时限与值班交接台',()=>{
 const fixCondition=async(page:any)=>{await page.getByTestId('canvas-node-condition').click();await page.getByLabel('条件字段').selectOption('amount');await page.getByLabel('条件比较值').fill('5000');await page.getByTestId('save-node-config').click();};
 const fixDuty=async(page:any)=>{await page.getByTestId('canvas-node-approval').click();await page.getByTestId('duty-group-select').selectOption({label:'财务值班组'});await page.getByTestId('save-node-config').click();};
 test('审批节点配置值班组、时限与暂停日历',async({page})=>{
  await page.goto('/workflows/wf-2');
  await page.getByTestId('canvas-node-approval').click();
  await expect(page.getByTestId('config-panel')).toContainText('服务时限与值班');
  await expect(page.getByTestId('duty-group-select')).toHaveValue('dg-hr');
  await expect(page.getByTestId('config-panel')).toContainText('09:00–17:00');
  await page.getByTestId('duty-group-select').selectOption({label:'财务值班组'});
  await expect(page.getByTestId('config-panel')).toContainText('08:00–16:00');
  await page.getByTestId('limit-minutes-input').fill('240');
  await page.getByTestId('pause-calendar-select').selectOption({label:'午间维护暂停'});
  await page.getByTestId('save-node-config').click();
  await expect(page.getByTestId('config-panel')).toContainText('配置已保存');
 });
 test('缺值班组时发布整批拒绝并列出节点，修复后冻结快照',async({page})=>{
  await page.goto('/workflows/wf-1');
  await fixCondition(page);
  await page.getByTestId('publish-button').click();
  await expect(page.getByRole('status')).toContainText('发布被拒绝');
  const rej=page.getByTestId('publish-rejection');
  await expect(rej).toContainText('发布被拒绝（整批）');
  await expect(rej).toContainText('节点未配置值班组');
  await expect(rej).toContainText('直属主管审批');
  await fixDuty(page);
  await page.getByTestId('publish-button').click();
  await expect(page.getByRole('status')).toContainText('发布成功');
  await expect(page.getByRole('status')).toContainText('时限快照已冻结');
  await page.goto('/workflows/wf-1/versions');
  await expect(page.getByTestId('sla-snapshot')).toContainText('时限快照 · v3');
  await expect(page.getByTestId('sla-snapshot')).toContainText('财务值班组');
  await expect(page.getByTestId('sla-snapshot')).toContainText('8 小时');
 });
 test('同组班次重叠时发布整批拒绝并列出冲突班次',async({page})=>{
  await page.goto('/workflows/wf-4');
  await fixCondition(page);
  await page.getByTestId('publish-button').click();
  await expect(page.getByRole('status')).toContainText('发布被拒绝');
  const rej=page.getByTestId('publish-rejection');
  await expect(rej).toContainText('IT 值班组');
  await expect(rej).toContainText('班次重叠');
  await expect(rej).toContainText('早班（08:00–16:00）');
  await expect(rej).toContainText('中班（12:00–20:00）');
 });
 test('时限非正数时发布整批拒绝',async({page})=>{
  await page.goto('/workflows/wf-7');
  await page.getByTestId('publish-button').click();
  await expect(page.getByRole('status')).toContainText('发布被拒绝');
  await expect(page.getByTestId('publish-rejection')).toContainText('审批时限必须为正数');
 });
 test('实例按工作分钟计时、暂停日历不计时、交接后剩余时限连续',async({page})=>{
  await page.goto('/monitor');
  await page.getByText('INS-2026-0025').click();
  await expect(page.getByTestId('sla-panel')).toContainText('快照 v1');
  await expect(page.getByTestId('sla-elapsed')).toHaveText('2 小时');
  await expect(page.getByTestId('sla-remaining')).toHaveText('8 小时');
  await expect(page.getByTestId('sla-panel')).toContainText('午间维护暂停');
  await expect(page.getByTestId('handover-list')).toContainText('财务值班组·早班 → 财务值班组·晚班');
  await page.getByTestId('handover-select').selectOption({label:'人事值班组 · 晚班（17:00–23:00）'});
  await page.getByTestId('handover-button').click();
  await expect(page.getByRole('status')).toContainText('交接完成');
  await expect(page.getByTestId('sla-remaining')).toHaveText('8 小时');
  await expect(page.getByTestId('sla-duty')).toContainText('人事值班组');
  await expect(page.getByTestId('handover-list')).toContainText('财务值班组·晚班 → 人事值班组·晚班');
  await expect(page.getByTestId('execution-timeline')).toContainText('值班交接');
 });
 test('运行中实例沿用旧快照，新实例才用新规则',async({page})=>{
  await page.goto('/workflows/wf-1');
  await fixCondition(page);
  await fixDuty(page);
  await page.getByTestId('publish-button').click();
  await expect(page.getByRole('status')).toContainText('发布成功');
  await page.goto('/monitor');
  await page.getByText('INS-2026-0025').click();
  await expect(page.getByTestId('sla-panel')).toContainText('快照 v1');
  await expect(page.getByTestId('sla-panel')).toContainText('沿用 v1 旧快照');
  await expect(page.getByTestId('sla-remaining')).toHaveText('8 小时');
  await page.getByTestId('instance-detail').locator('.drawer-head button').click();
  await page.getByTestId('simulate-instance').click();
  await expect(page.getByTestId('sla-panel')).toContainText('快照 v3');
  await expect(page.getByTestId('sla-panel')).toContainText('当前 v3 时限快照');
 });
 test('刷新后配置、快照和剩余时限一致',async({page})=>{
  await page.goto('/workflows/wf-1');
  await fixCondition(page);
  await fixDuty(page);
  await page.getByTestId('publish-button').click();
  await expect(page.getByRole('status')).toContainText('发布成功');
  await page.reload();
  await page.getByTestId('canvas-node-approval').click();
  await expect(page.getByTestId('duty-group-select')).toHaveValue('dg-finance');
  await expect(page.getByTestId('limit-minutes-input')).toHaveValue('480');
  await page.goto('/workflows/wf-1/versions');
  await expect(page.getByTestId('sla-snapshot')).toContainText('时限快照 · v3');
  await page.goto('/monitor');
  await page.getByText('INS-2026-0025').click();
  await expect(page.getByTestId('sla-remaining')).toHaveText('8 小时');
 });
});
