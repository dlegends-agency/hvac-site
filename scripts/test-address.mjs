// Offline tests for the business address check. Run: npm run address:test
import assert from "node:assert/strict";
import { addressProblems } from "../src/lib/address-check.ts";

// The mistake that kept a Pennsylvania lead from reaching the business: the state typed in the city box, a Houston ZIP code.
const wrong = addressProblems({ city: "Pennsylvania", state: "Texas", postal_code: "77587" });
assert.equal(wrong.length, 1);
assert.match(wrong[0], /"Pennsylvania", which is a state, not a city/);

assert.deepEqual(addressProblems({ city: "Bethlehem", state: "Pennsylvania", postal_code: "18020" }), [], "a correct address has no problems");
assert.deepEqual(addressProblems({ city: "Houston", state: "TX", postal_code: "77587-1234" }), [], "two-letter states and ZIP+4 are fine");
assert.deepEqual(addressProblems({ city: "New York", state: "NY", postal_code: "10001" }), [], "New York is a real city");
assert.deepEqual(addressProblems({ city: "Washington", state: "DC", postal_code: "20001" }), [], "so is Washington");
assert.match(addressProblems({ city: "TX", state: "Texas", postal_code: "77001" })[0], /is a state, not a city/, "a state code in the city box is caught");
assert.match(addressProblems({ city: "Austin", state: "Texs", postal_code: "78701" })[0], /"Texs" is not a US state/);
assert.match(addressProblems({ city: "Austin", state: "Texas", postal_code: "" })[0], /Add the 5-digit ZIP/);
assert.match(addressProblems({ city: "Austin", state: "Texas", postal_code: "787" })[0], /Add the 5-digit ZIP/, "a short ZIP is not enough");
assert.deepEqual(addressProblems({ city: "", state: "", postal_code: null }), ["Add the city.", "Add the state.", "Add the 5-digit ZIP code: nearby requests, permits and bids are matched by distance from it."]);
assert.deepEqual(addressProblems({}), addressProblems({ city: "", state: "", postal_code: "" }), "missing fields are handled");

console.log("address check: all checks passed");
