import { localePath } from "@/config/site-manifest";
export function LegacyToolNotice({ locale }: { locale: string }) {
  return (
    <aside role="note" className="mx-auto max-w-4xl border rounded p-4 my-4">
      <strong>
        {locale === "zh"
          ? "旧版界面 · 尚未接入可靠任务链路"
          : "Legacy interface · not connected to the verified task workflow"}
      </strong>
      <p>
        {locale === "zh"
          ? "这些模型与图生功能未完成真实验收，不能通过此页面提交新的付费任务。已保存的旧记录保留。"
          : "These models and image inputs have not passed live acceptance. New paid submissions are unavailable on this page. Existing records are retained."}
      </p>
      <a className="underline" href={localePath(locale, "/text-to-video")}>
        {locale === "zh"
          ? "打开已接通的文生视频工具"
          : "Open the connected text-to-video tool"}
      </a>
    </aside>
  );
}
