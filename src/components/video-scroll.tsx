"use client";
import { siteManifest as siteBrand } from "@/config/site-manifest";

import Link from "next/link";
import Image from "next/image";

import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import { ColourfulText } from "@/components/ui/colorful-text";

export function VideoScroll({
  dict,
}: { dict: Record<string, string> | undefined }) {
  return (
    <div className="flex flex-col overflow-hidden">
      <ContainerScroll
        titleComponent={
          <h1 className="text-4xl font-semibold text-black dark:text-white">
            {dict?.first_text}
            <br />
            <span className="text-4xl md:text-6xl font-bold mt-1 leading-none">
              {dict?.second_text1}
              <ColourfulText text={dict?.time_text ?? ""} />
              {dict?.second_text2}
            </span>
          </h1>
        }
      >
        <Image
          src={`https://cdnv2.ruguoapp.com/FoAVSRtT2zVc96oDjAWrd5TvXXQ4v3.png`}
          alt={`${siteBrand.ui.brand.name} AI video generation platform preview`}
          height={720}
          width={1400}
          className="mx-auto rounded-2xl object-cover h-full object-left-top"
          draggable={false}
        />
      </ContainerScroll>
    </div>
  );
}
