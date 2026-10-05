import { describe, expect, test } from "bun:test";
import { fixture, percentile, workload } from "../scripts/benchmarks/visual/shared";
import { assertNewReport, configuration } from "../scripts/benchmarks/visual/config";
import { resolve } from "node:path";

describe("visual benchmark workload",()=>{
  test("uses deterministic Constellation positions for equal visible workloads",()=>{
    const snapshot=fixture(400),left=workload(snapshot,400),right=workload(snapshot,400);
    expect(left.nodes).toEqual(right.nodes);expect(left.pose(1.2)).toEqual(right.pose(1.2));
    expect(left.nodes).toHaveLength(400);expect(left.edges).toHaveLength(800);
    expect(left.pose(1.2)).not.toEqual(left.pose(0));
  });
  test("reports retained edges and source cap rather than requested stress counts",()=>{
    const snapshot=fixture(1000),capped=workload(snapshot,400),full=workload(snapshot,1000),ids=new Set(capped.nodes.map(node=>node.id));
    expect(capped.nodes).toHaveLength(400);expect(full.nodes).toHaveLength(1000);expect(full.edges).toHaveLength(2000);
    expect(capped.edges.length).toBeLessThan(800);expect(capped.edges.every(edge=>ids.has(edge.source)&&ids.has(edge.target))).toBe(true);
    expect(capped.nodes.map(node=>node.point)).toEqual(full.nodes.slice(0,400).map(node=>node.point));
  });
  test("bounds sizes and handles null latency summaries",()=>{
    expect(()=>fixture(100000)).toThrow();expect(percentile([],.95)).toBeNull();
    expect(percentile([40,10,30,20],.5)).toBe(20);expect(percentile([40,10,30,20],.95)).toBe(40);
  });
  test("accepts both CLI options and rejects incomplete or duplicate options",()=>{
    const root=resolve(import.meta.dir,"..");
    expect(configuration([],root)).toEqual({port:4320,output:resolve(root,"data/visual-benchmark.json")});
    expect(configuration(["--out","data/new-report.json","--port","4321"],root)).toEqual({port:4321,output:resolve(root,"data/new-report.json")});
    for(const args of [["--out"],["--unknown"],["--port","20"],["--port","4320","--port","4321"]]) expect(()=>configuration(args,root)).toThrow();
  });
  test("refuses an existing report destination before starting",async()=>{
    await expect(assertNewReport(import.meta.path)).rejects.toThrow("already exists");
    await expect(assertNewReport(resolve(import.meta.dir,"benchmark-visual-test-never-created.json"))).resolves.toBeUndefined();
  });
});
