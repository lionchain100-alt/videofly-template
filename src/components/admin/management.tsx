import { siteManifest } from "@/config/site-manifest";
import { localePath } from "@/config/site-manifest";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Params } from "@/lib/admin/queries";
import styles from "./management.module.css";

export { styles as adminStyles };
export function adminPath(locale: string, path = "") {
  return `${locale === siteManifest.languages.default ? "" : `/${locale}`}/admin${path}`;
}
export function formatDate(value: Date | string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "—";
}
export function SectionTitle({
  title,
  description,
  children,
}: { title: string; description: string; children?: ReactNode }) {
  return (
    <header className={styles.title}>
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}
export function Panel({
  title,
  children,
}: { title?: string; children: ReactNode }) {
  return (
    <section className={styles.panel}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
export function StatusBadge({
  children,
  tone = "neutral",
}: { children: ReactNode; tone?: "neutral" | "good" | "bad" | "warn" }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
export function EmptyState({
  children = "暂无符合条件的数据",
}: { children?: ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}
export function DataTable({
  headings,
  children,
}: { headings: string[]; children: ReactNode }) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            {headings.map((name) => (
              <th key={name} scope="col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Pagination({
  params,
  page,
  pages,
  total,
}: { params: Params; page: number; pages: number; total: number }) {
  function href(next: number) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
      if (typeof value === "string" && key !== "page") query.set(key, value);
    query.set("page", String(next));
    return `?${query}`;
  }
  return (
    <div className={styles.pagination}>
      <span>
        共 {total} 条 · 第 {page} / {pages} 页
      </span>
      <div>
        {page > 1 ? (
          <Link href={href(page - 1)}>上一页</Link>
        ) : (
          <span aria-disabled="true">上一页</span>
        )}
        {page < pages ? (
          <Link href={href(page + 1)}>下一页</Link>
        ) : (
          <span aria-disabled="true">下一页</span>
        )}
      </div>
    </div>
  );
}
export function Filter({
  name,
  label,
  defaultValue = "",
  children,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.filter}>
      <label htmlFor={`filter-${name}`}>{label}</label>
      {children ? (
        <select id={`filter-${name}`} name={name} defaultValue={defaultValue}>
          {children}
        </select>
      ) : (
        <input
          id={`filter-${name}`}
          name={name}
          defaultValue={defaultValue}
          placeholder={label}
        />
      )}
    </div>
  );
}
