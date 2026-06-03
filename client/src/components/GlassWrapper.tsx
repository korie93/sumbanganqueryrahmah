import "./GlassWrapper.css";

interface GlassWrapperProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Renders the shared glass wrapper component used across SQR screens.
 */
export default function GlassWrapper({ children, className = "" }: GlassWrapperProps) {
  return (
    <div className={`glass-wrapper p-6 ${className}`}>
      {children}
    </div>
  );
}
