import { requireAdmin } from "@/lib/auth/admin";
import { adminPath } from "@/components/admin/management";
import { getDashboardOverview } from "@/lib/admin/dashboard";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Users as UsersIcon,
  Video,
  Coins,
  TrendingUp,
  CheckCircle,
  XCircle,
  Clock,
} from "@/components/ui/icons";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage({
  params,
}: { params: Promise<{ locale: string }> }) {
  await requireAdmin();
  const { locale } = await params;
  const overview = await getDashboardOverview();
  const { all, text, video, other } = overview.tasks;
  const totalUsers = overview.users.total;
  const recentUsers = overview.users.recent;
  const totalTasks = all.total;
  const recentTasks = all.recent;
  const completedTasks = all.succeeded;
  const failedTasks = all.failed;
  const pendingTasks = all.pending;
  const totalFinishedTasks = completedTasks + failedTasks;
  const successRate = all.successRate;
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">管理后台概览</h1>
        <p className="text-muted-foreground">
          统一统计文本摘要、新视频与既有视频任务；包含用户删除标记的运营记录。
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总用户数</CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              最近 7 天新增: +{recentUsers}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">任务总数</CardTitle>
            <Video className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTasks}</div>
            <p className="text-xs text-muted-foreground">
              最近 7 天新增: +{recentTasks}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">成功率</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {completedTasks} / {totalFinishedTasks} 已结束任务成功
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">积分包总数</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.packages}</div>
            <p className="text-xs text-muted-foreground">所有用户</p>
          </CardContent>
        </Card>
      </div>

      {/* Video Status Breakdown */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">已完成</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {completedTasks}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalTasks > 0
                ? ((completedTasks / totalTasks) * 100).toFixed(1)
                : 0}
              % 的总数
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">失败</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{failedTasks}</div>
            <p className="text-xs text-muted-foreground">
              {totalTasks > 0
                ? ((failedTasks / totalTasks) * 100).toFixed(1)
                : 0}
              % 的总数
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">处理中</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {pendingTasks}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalTasks > 0
                ? ((pendingTasks / totalTasks) * 100).toFixed(1)
                : 0}
              % 的总数
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>按工具统计</CardTitle>
          <CardDescription>
            最近 7 天为当前时刻向前 168 小时（含起点，不含未来）；成功率 = 成功
            /（成功 + 失败），未结束任务不计入分母。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="按工具统计">
              <thead>
                <tr>
                  {[
                    "工具",
                    "总数",
                    "最近 7 天新增",
                    "成功",
                    "失败",
                    "处理中",
                    "其他状态",
                    "成功率",
                  ].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="whitespace-nowrap p-2 text-left"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { key: "all", label: "全部任务", counts: all },
                  { key: "text", label: "文本摘要", counts: text },
                  { key: "video", label: "视频（含既有视频）", counts: video },
                  ...(other.total
                    ? [{ key: "other", label: "其他工具", counts: other }]
                    : []),
                ].map(({ key, label, counts }) => (
                  <tr
                    key={key}
                    data-testid={`task-stats-${key}`}
                    className="border-t"
                  >
                    <th
                      scope="row"
                      className="whitespace-nowrap p-2 text-left font-medium"
                    >
                      {label}
                    </th>
                    {[
                      counts.total,
                      counts.recent,
                      counts.succeeded,
                      counts.failed,
                      counts.pending,
                      counts.other,
                      `${counts.successRate.toFixed(1)}%`,
                    ].map((value, index) => (
                      <td
                        key={
                          [
                            "total",
                            "recent",
                            "succeeded",
                            "failed",
                            "pending",
                            "other",
                            "rate",
                          ][index]
                        }
                        className="p-2"
                      >
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>快速操作</CardTitle>
          <CardDescription>常用管理功能</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <a
            href={adminPath(locale, "/users")}
            className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted"
          >
            <UsersIcon className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="font-medium">用户管理</div>
              <div className="text-sm text-muted-foreground">
                查看和管理用户
              </div>
            </div>
          </a>

          <a
            href={adminPath(locale, "/tasks")}
            className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted"
          >
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="font-medium">任务列表</div>
              <div className="text-sm text-muted-foreground">
                查看任务状态与失败原因
              </div>
            </div>
          </a>

          <a
            href={adminPath(locale, "/credits")}
            className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted"
          >
            <Coins className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="font-medium">积分流水</div>
              <div className="text-sm text-muted-foreground">
                查看积分变动与发放记录
              </div>
            </div>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
