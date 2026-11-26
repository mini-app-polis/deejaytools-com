/**
 * Keeps React rendering when a browser translator has rewritten the page.
 *
 * Chrome's built-in Google Translate (and others like it) swaps the text
 * nodes React made for its own `<font>` elements. When React later removes
 * one of those text nodes, or inserts before it, the node is no longer where
 * React put it and the DOM throws a NotFoundError ("Failed to execute
 * 'insertBefore' on 'Node'"), which takes the page to the error screen. With
 * this guard the two calls cope instead: a removal of a node that has already
 * moved is skipped, and an insertion before one goes at the end of the parent.
 * The translated text stays on screen and React carries on. This is the
 * workaround the React team points to for the problem (facebook/react#11538).
 *
 * Calls on nodes still where React put them behave exactly as before.
 */
export function guardAgainstTranslators(): void {
  if (typeof Node !== "function" || patched.has(Node.prototype)) return;
  patched.add(Node.prototype);

  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };

  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, reference: Node | null): T {
    if (reference && reference.parentNode !== this) return insertBefore.call(this, node, null) as T;
    return insertBefore.call(this, node, reference) as T;
  };
}

const patched = new WeakSet<object>();
