import { siteManifest as siteBrand } from "@/config/site-manifest";
import type { Locale } from "@/config/i18n-config";

export const metadata = {
  title: `Privacy Policy - ${siteBrand.ui.brand.name}`,
  description: `Privacy Policy for ${siteBrand.ui.brand.name}`,
};

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;

  return (
    <div className="container mx-auto max-w-4xl py-12 md:py-24">
      <div className="prose prose-gray dark:prose-invert max-w-none">
        {locale === "zh" ? (
          <>
            <h1>隐私政策</h1>
            <p className="lead">生效日期：2026年2月8日</p>

            <h2>1. 引言</h2>
            <p>
              {siteBrand.ui.brand.name}
              （"我们"）非常重视您的隐私。本隐私政策说明了当您使用我们的服务时，我们如何收集、使用、披露和保护您的信息。
            </p>

            <h2>2. 我们收集的信息</h2>
            <p>我们需要收集以下类型的信息：</p>
            <ul>
              <li>
                <strong>账户信息：</strong>{" "}
                当您注册时，我们收集您的电子邮件地址、用户名和头像。
              </li>
              <li>
                <strong>使用数据：</strong>{" "}
                我们收集有关您如何与我们的服务互动的信息，例如您生成的视频类型、使用频率和访问时间。
              </li>
              <li>
                <strong>输入内容：</strong>{" "}
                您上传的图片、文本或其他用于生成视频的输入内容。
              </li>
              <li>
                <strong>生成内容：</strong> 您使用我们的服务生成的视频内容。
              </li>
            </ul>

            <h2>3. 我们如何使用您的信息</h2>
            <p>我们使用收集的信息用于以下目的：</p>
            <ul>
              <li>提供、维护和改进我们的服务。</li>
              <li>处理您的交易和管理您的积分。</li>
              <li>向您发送相关通知，包括服务更新和安全警报。</li>
              <li>监测和分析趋势、使用情况和活动，以改善用户体验。</li>
              <li>检测、调查和防止欺诈及其他非法活动。</li>
            </ul>

            <h2>4. 信息共享</h2>
            <p>
              我们不会将您的个人信息出售给第三方。我们仅在以下情况下共享您的信息：
            </p>
            <ul>
              <li>
                与帮助我们运营服务的服务提供商（如云托管、支付处理）共享。
              </li>
              <li>为了遵守法律义务、法院命令或法律程序。</li>
              <li>为了保护我们、我们的用户或公众的权利、财产或安全。</li>
            </ul>

            <h2>5. 数据安全</h2>
            <p>
              我们采取合理的安全措施来保护您的信息免遭未经授权的访问、更改、披露或销毁。但是，没有任何互联网传输或电子存储方法是100%安全的，我们不能保证绝对的安全。
            </p>

            <h2>6. 您的权利</h2>
            <p>
              根据适用法律，您可能有权访问、更正、删除或限制我们处理您的个人信息。您可以随时通过您的账户设置或联系我们来行使这些权利。
            </p>

            <h2>7. 儿童隐私</h2>
            <p>
              我们的服务不面向未满13岁（或您所在司法管辖区规定的其他年龄）的儿童。如果我们发现收集了儿童的个人信息，我们会采取措施尽快删除。
            </p>

            <h2>8. 政策变更</h2>
            <p>
              我们要保留随时更新本隐私政策的权利。如果我们做出重大变更，我们将通过服务通知您或通过电子邮件发送通知。
            </p>

            <h2>9. 联系我们</h2>
            <p>
              如果您对本隐私政策有任何疑问，请联系我们：
              {siteBrand.contact.privacyEmail}
            </p>
          </>
        ) : (
          <>
            <h1>Privacy Policy</h1>
            <p className="lead">Effective Date: February 8, 2026</p>

            <h2>1. Introduction</h2>
            <p>
              {siteBrand.ui.brand.name} ("we" or "us") values your privacy. This
              Privacy Policy explains how we collect, use, disclose, and protect
              your information when you use our services.
            </p>

            <h2>2. Information We Collect</h2>
            <p>We collect the following types of information:</p>
            <ul>
              <li>
                <strong>Account Information:</strong> When you register, we
                collect your email address, username, and profile picture.
              </li>
              <li>
                <strong>Usage Data:</strong> We collect information about how
                you interact with our service, such as the types of videos you
                generate, frequency of use, and access times.
              </li>
              <li>
                <strong>Input Content:</strong> Images, text, or other inputs
                you upload to generate videos.
              </li>
              <li>
                <strong>Generated Content:</strong> Video content you generate
                using our service.
              </li>
            </ul>

            <h2>3. How We Use Your Information</h2>
            <p>We use the collected information for the following purposes:</p>
            <ul>
              <li>To provide, maintain, and improve our services.</li>
              <li>To process your transactions and manage your credits.</li>
              <li>
                To send you relevant notifications, including service updates
                and security alerts.
              </li>
              <li>
                To monitor and analyze trends, usage, and activities to improve
                user experience.
              </li>
              <li>
                To detect, investigate, and prevent fraud and other illegal
                activities.
              </li>
            </ul>

            <h2>4. Information Sharing</h2>
            <p>
              We do not sell your personal information to third parties. We
              share your information only in the following circumstances:
            </p>
            <ul>
              <li>
                With service providers who assist us in operating our services
                (e.g., cloud hosting, payment processing).
              </li>
              <li>
                To comply with legal obligations, court orders, or legal
                processes.
              </li>
              <li>
                To protect the rights, property, or safety of us, our users, or
                the public.
              </li>
            </ul>

            <h2>5. Data Security</h2>
            <p>
              We implement reasonable security measures to protect your
              information from unauthorized access, alteration, disclosure, or
              destruction. However, no method of transmission over the internet
              or electronic storage is 100% secure, and we cannot guarantee
              absolute security.
            </p>

            <h2>6. Your Rights</h2>
            <p>
              Depending on applicable laws, you may have the right to access,
              correct, delete, or restrict the processing of your personal
              information. You can exercise these rights at any time through
              your account settings or by contacting us.
            </p>

            <h2>7. Children's Privacy</h2>
            <p>
              Our services are not intended for children under 13 (or other age
              as required by local law). If we discover we have collected
              personal information from children, we will take steps to delete
              it as soon as possible.
            </p>

            <h2>8. Changes to Policy</h2>
            <p>
              We reserve the right to update this Privacy Policy at any time. If
              we make material changes, we will notify you through the service
              or by email.
            </p>

            <h2>9. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy, please
              contact us at: {siteBrand.contact.privacyEmail}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
