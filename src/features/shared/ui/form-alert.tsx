/** Form-level message: an error, or a success notice. */
export function FormAlert({
  tone = "danger",
  title,
  children,
}: {
  tone?: "danger" | "success";
  title?: string;
  children?: React.ReactNode;
}) {
  const tones = {
    danger: "border-danger/30 bg-danger-surface text-danger",
    success: "border-success/30 bg-success-surface text-success",
  };

  return (
    <div role="alert" className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm ${tones[tone]}`}>
      {title && <p className="font-medium">{title}</p>}
      {children && <p>{children}</p>}
    </div>
  );
}
