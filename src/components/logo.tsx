import Image from "next/image";

export function Logo({ className = "h-10 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/logo-snapvibe.png"
      alt="SnapVibe"
      width={240}
      height={195}
      sizes="120px"
      priority
      style={{ aspectRatio: "240 / 195" }}
      className={className}
    />
  );
}
