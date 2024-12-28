import { describe, expect, test } from "vitest";
import { getCategories } from "./medium";

describe("Medium API", () => {
  test("getCategories should return list of categories", async () => {
    const resp = await getCategories();
    expect(resp.categories).toBeDefined();
    expect(Array.isArray(resp.categories)).toBe(true);
  });
});