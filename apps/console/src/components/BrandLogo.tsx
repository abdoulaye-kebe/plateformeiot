type BrandLogoProps = {
  variant?: "dark" | "light";
  subtitle?: string;
  compact?: boolean;
  iconOnly?: boolean;
};

/** Logo Orange — carré orange + produit (style Live Objects) */
export default function BrandLogo({ variant = "dark", subtitle, compact = false, iconOnly = false }: BrandLogoProps) {
  const productColor = variant === "dark" ? "text-white" : "text-black";
  const subtitleColor = variant === "dark" ? "text-white/70" : "text-gray-600";

  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex shrink-0 items-center justify-center bg-brand ${compact ? "h-8 w-8" : "h-9 w-9"}`}
        aria-hidden
      >
        <span className={`font-bold lowercase leading-none text-white ${compact ? "text-[8px]" : "text-[9px]"}`}>
          orange
        </span>
      </div>
      {!iconOnly && (
        <div className="min-w-0">
          <p className={`truncate font-bold leading-tight ${productColor} ${compact ? "text-base" : "text-lg"}`}>
            Orange IoT Platform
          </p>
          <p className={`truncate text-[10px] uppercase tracking-widest ${subtitleColor}`}>
            {subtitle ?? "LoRaWAN · MQTT · LwM2M"}
          </p>
        </div>
      )}
    </div>
  );
}
