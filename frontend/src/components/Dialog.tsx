import { ReactNode, useEffect, useRef } from "react";

/** Native modal behavior contains keyboard focus and restores it on close. */
export function Dialog({ children, onClose, label }: {
  children: ReactNode;
  onClose: () => void;
  label: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      trigger?.focus();
    };
  }, []);

  return (
    <dialog ref={ref} aria-label={label} className="app-dialog"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      {children}
    </dialog>
  );
}
