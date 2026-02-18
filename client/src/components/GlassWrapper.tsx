interface GlassWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export default function GlassWrapper({ children, className = "" }: GlassWrapperProps) {
  return (
    <div className={`glass-wrapper p-6 ${className}`}>
      {children}
    </div>
  );
}
