import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
export function ToastNotice({ message }: { message: string }) {
  const [host, Host] = useState<Element>(document.body);
  useLayoutEffect(() => {
    const update = () => {
      const dialogs = document.querySelectorAll("dialog[open]");
      Host(dialogs[dialogs.length - 1] || document.body);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    return () => observer.disconnect();
  }, []);
  return createPortal(
    <div className="toast" role="status">
      {message}
    </div>,
    host,
  );
}
