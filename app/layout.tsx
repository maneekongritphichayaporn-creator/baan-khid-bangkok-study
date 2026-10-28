import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "บ้านคิด — Bangkok Property Intelligence",
  description: "สำรวจราคา ทำเล และโอกาสลงทุนอสังหาริมทรัพย์ในกรุงเทพฯ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
