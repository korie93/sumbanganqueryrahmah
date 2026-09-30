import assert from "node:assert/strict";
import test from "node:test";
import { expand } from "brace-expansion";
import { ipKeyGenerator } from "express-rate-limit";
import { Address4, Address6 } from "ip-address";

// These checks use reserved/local example addresses and tiny in-memory inputs.
// They never contact a host or construct resource-exhaustion payloads.
test("IP subnet checks do not confuse matching prefixes across address families", () => {
  const ipv4 = new Address4("10.1.2.3");
  const ipv6 = new Address6("a00::1");
  const ipv4Subnet = new Address4("10.0.0.0/8");
  const ipv6Subnet = new Address6("a00::/8");

  assert.equal(ipv4.isInSubnet(ipv4Subnet), true);
  assert.equal(ipv6.isInSubnet(ipv6Subnet), true);
  assert.equal(ipv4.isInSubnet(ipv6Subnet), false);
  assert.equal(ipv6.isInSubnet(ipv4Subnet), false);
  assert.equal(ipv4.isHostInSubnet(ipv6Subnet), false);
  assert.equal(ipv6.isHostInSubnet(ipv4Subnet), false);
});

test("link-local classification covers the full IPv6 /10 and ignores the supplied host mask", () => {
  for (const address of ["fe80::1", "febf:ffff::1", "fe80::1/0", "febf:ffff::1/0"]) {
    assert.equal(new Address6(address).isLinkLocal(), true, address);
  }
  for (const address of ["fe7f::1", "fec0::1", "2001:db8::1"]) {
    assert.equal(new Address6(address).isLinkLocal(), false, address);
  }
  assert.equal(new Address4("169.254.1.2/0").isLinkLocal(), true);
});

test("mapped and NAT64 addresses retain their embedded IPv4 security classification", () => {
  for (const [ipv4, classification] of [
    ["127.0.0.1", "isLoopback"],
    ["10.0.0.1", "isPrivate"],
    ["169.254.1.2", "isLinkLocal"],
  ]) {
    for (const translated of [Address6.fromAddress4(ipv4), Address6.fromAddress4Nat64(ipv4)]) {
      assert.equal(translated[classification](), true, `${ipv4}: ${classification}`);
      assert.equal(new Address6(`${translated.correctForm()}/0`)[classification](), true);
    }
  }
  const ordinary = Address6.fromAddress4Nat64("192.0.2.33");
  assert.equal(ordinary.isLoopback(), false);
  assert.equal(ordinary.isPrivate(), false);
  assert.equal(ordinary.isLinkLocal(), false);
  assert.equal(ordinary.toAddress4Nat64().correctForm(), "192.0.2.33");
  assert.equal(new Address6("2001:db8::1").toAddress4Nat64(), null);
});

test("IPv6 parsing rejects oversized address text before generating detailed diagnostics", () => {
  // One character beyond the parser's 45-character address limit, not a large payload.
  const invalid = "1".repeat(46);
  assert.equal(Address6.isValid(invalid), false);
  assert.throws(() => new Address6(invalid), /IPv6 addresses are at most 45 characters/);
  assert.equal(Address6.isValid("2001:db8::1/64"), true);
  assert.equal(Address6.isValid("fe80::1%eth0"), true);
});

test("rate-limit IP keys preserve IPv4 identity and normal IPv6 subnet grouping", () => {
  assert.equal(ipKeyGenerator("192.0.2.8"), "192.0.2.8");
  assert.equal(ipKeyGenerator("::ffff:192.0.2.8"), "192.0.2.8");
  assert.equal(ipKeyGenerator("2001:db8:abcd:1201::1"), "2001:db8:abcd:1200::/56");
  assert.equal(ipKeyGenerator("2001:db8:abcd:12ff::2"), "2001:db8:abcd:1200::/56");
  assert.notEqual(ipKeyGenerator("2001:db8:abcd:1301::1"), ipKeyGenerator("2001:db8:abcd:1201::1"));
  assert.equal(ipKeyGenerator("2001:db8:abcd:1201::1", 64), "2001:db8:abcd:1201::/64");
  assert.equal(ipKeyGenerator("2001:db8:abcd:1201::1", false), "2001:db8:abcd:1201::1");
});

test("brace expansion keeps ordinary glob alternatives and padded sequences compatible", () => {
  assert.deepEqual(expand("src/{client,server}/file{01..02}.ts"), [
    "src/client/file01.ts",
    "src/client/file02.ts",
    "src/server/file01.ts",
    "src/server/file02.ts",
  ]);
  assert.deepEqual(expand("{a,{b,c},d}"), ["a", "b", "c", "d"]);
  assert.deepEqual(expand("plain.ts"), ["plain.ts"]);
});

test("brace expansion bounds both result count and accumulated character length", () => {
  const pattern = "p{a,b}{c,d}";
  assert.deepEqual(expand(pattern, { max: 3 }), ["pac", "pad", "pbc"]);
  assert.deepEqual(expand(pattern, { maxLength: 6 }), ["pac", "pad"]);
});

test("brace expansion stops nested recursion at a configurable small depth", () => {
  const pattern = "{{{a,b}}}";
  assert.deepEqual(expand(pattern), ["{{a}}", "{{b}}"]);
  // Test the boundary with three levels, rather than probing the native stack limit.
  assert.deepEqual(expand(pattern, { maxDepth: 1 }), [pattern]);
});

test("brace expansion bounds malformed-group rewrites with a small option limit", () => {
  const pattern = "{a}}}},z}";
  assert.deepEqual(expand(pattern), ["a}}}}", "z"]);
  assert.deepEqual(expand(pattern, { maxRewrites: 1 }), [pattern]);
});
