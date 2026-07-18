import { register } from "node:module";

const cssLoaderSource = `export async function load(url, context, nextLoad) {
  if (url.endsWith(".css")) {
    return { format: "module", shortCircuit: true, source: "export default {};" };
  }
  return nextLoad(url, context);
}`;

register(`data:text/javascript,${encodeURIComponent(cssLoaderSource)}`, import.meta.url);
