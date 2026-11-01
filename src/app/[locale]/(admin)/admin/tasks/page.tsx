import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { listAdminTasks, param, taskLabels, type Params } from "@/lib/admin/queries";
import {
  SectionTitle,
  Panel,
  Filter,
  DataTable,
  EmptyState,
  Pagination,
  StatusBadge,
  adminPath,
  formatDate,
  adminStyles as s,
} from "@/components/admin/management";

export const dynamic = "force-dynamic";
export default async function TasksPage({
  params,
  searchParams,
}: { params: Promise<{ locale: string }>; searchParams: Promise<Params> }) {
  await requireAdmin();
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const data = await listAdminTasks(query);
  return (
    <>
      <SectionTitle title="任务列表" description="查看任务状态、供应商、计费记录和失败原因。" />
      <p className={s.notice}>
        统一查看文本摘要与既有视频任务。UI Studio 预览仍为隔离演示，不创建真实任务。
      </p>
      <Panel>
        <form className={s.filters} method="get">
          <Filter
            name="q"
            label="搜索任务编号、用户邮箱或提示词"
            defaultValue={param(query, "q")}
          />
          <Filter name="userId" label="用户 ID" defaultValue={param(query, "userId")} />
          <Filter name="status" label="任务状态" defaultValue={param(query, "status")}>
            <option value="">全部状态</option>
            {Object.entries(taskLabels).map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </Filter>
          <Filter name="model" label="模型" defaultValue={param(query, "model")} />
          <Filter name="provider" label="供应商" defaultValue={param(query, "provider")}>
            <option value="">全部供应商</option>
            <option value="openai-compatible">OpenAI 兼容文本</option>
            <option value="openai">OpenAI</option>
            <option value="deepseek">DeepSeek</option>
            <option value="evolink">Evolink</option>
            <option value="kie">Kie</option>
            <option value="apimart">Apimart</option>
          </Filter>
          <Filter name="deleted" label="用户删除标记" defaultValue={param(query, "deleted")}>
            <option value="">包含全部</option>
            <option value="no">未删除</option>
            <option value="yes">已删除</option>
          </Filter>
          <button className={s.primary} type="submit">
            筛选
          </button>
          <Link className={s.textButton} href={adminPath(locale, "/tasks")}>
            重置
          </Link>
        </form>
      </Panel>
      <Panel title="生成任务">
        {data.rows.length ? (
          <DataTable
            headings={["任务 / 用户", "模型 / 供应商", "状态", "任务计费", "创建时间", "操作"]}
          >
            {data.rows.map((row) => (
              <tr key={row.uuid}>
                <td>
                  <Link href={adminPath(locale, `/tasks/${encodeURIComponent(row.uuid)}`)}>
                    <code>{row.uuid}</code><small>{row.kind === "text-summary" ? "文本摘要" : "视频生成"}</small>
                  </Link>
                  <small>
                    <Link href={adminPath(locale, `/users/${encodeURIComponent(row.userId)}`)}>
                      {row.email || row.userId}
                    </Link>
                  </small>
                </td>
                <td>
                  {row.model}
                  <small>{row.provider || "未提交供应商"}</small>
                </td>
                <td>
                  <StatusBadge
                    tone={
                      row.status === "FAILED" ? "bad" : ["COMPLETED","SUCCEEDED"].includes(row.status) ? "good" : "warn"
                    }
                  >
                    {taskLabels[row.status] || row.status}
                  </StatusBadge>
                  {row.isDeleted && <small>用户已删除</small>}
                  <small className={s.wrap}>{row.errorMessage}</small>
                </td>
                <td>{row.creditsUsed} 积分</td>
                <td>{formatDate(row.createdAt)}</td>
                <td>
                  <Link href={adminPath(locale, `/tasks/${encodeURIComponent(row.uuid)}`)}>
                    查看详情 →
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState>
            暂无匹配任务。真实生成任务创建后会自动显示；当前不会填入演示记录。
          </EmptyState>
        )}
        <Pagination params={query} {...data} />
      </Panel>
    </>
  );
}
