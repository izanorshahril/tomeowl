import { existsSync, readdirSync } from "node:fs";
import { TomeowlError } from "./domain";

export function assertEmptyDirectory(path:string):void {
  if(existsSync(path)&&readdirSync(path).length)throw new TomeowlError("Projection output directory must be empty","PROJECT_OUTPUT_NOT_EMPTY");
}
