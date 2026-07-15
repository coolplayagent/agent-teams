import { rmSync } from "node:fs";
import { resolve } from "node:path";

for (const fileName of ["testMain.js", "testMain.js.map"]) {
  rmSync(resolve("dist-desktop", "desktop", fileName), { force: true });
}
