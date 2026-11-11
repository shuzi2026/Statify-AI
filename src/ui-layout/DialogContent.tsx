import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from "react";

function flatten(nodes: ReactNode): ReactNode[] {
  return Children.toArray(nodes).flatMap((node) =>
    isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment
      ? flatten(node.props.children)
      : [node],
  );
}
/** Keep form ownership intact: scrolling the fields never moves the submit row. */
export function DialogContent({
  children,
  scrollPreamble = false,
}: {
  children: ReactNode;
  scrollPreamble?: boolean;
}) {
  const nodes = flatten(children),
    form = nodes.findIndex((n) => isValidElement(n) && n.type === "form");
  if (form >= 0) {
    const element = nodes[form] as ReactElement<{
      children: ReactNode;
      className?: string;
    }>;
    return (
      <>
        {!scrollPreamble && (
          <div className="dialog-preamble">{nodes.slice(0, form)}</div>
        )}
        {cloneElement(
          element,
          { className: (element.props.className || "") + " dialog-form-shell" },
          <DialogContent>
            {scrollPreamble && nodes.slice(0, form)}
            {element.props.children}
          </DialogContent>,
        )}
        {nodes.slice(form + 1)}
      </>
    );
  }
  const footer = nodes.findIndex(
    (n) =>
      isValidElement<{ className?: string }>(n) &&
      /\b(dialog-actions|abandon-actions)\b/.test(n.props.className || ""),
  );
  return (
    <>
      <div className="dialog-scroll">
        {footer < 0 ? nodes : nodes.slice(0, footer)}
      </div>
      {footer >= 0 && (
        <div className="dialog-fixed-footer">{nodes.slice(footer)}</div>
      )}
    </>
  );
}
