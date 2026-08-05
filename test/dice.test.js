/**
 * Tests for public/js/dice.js
 *
 * dice.js is written as a browser-style IIFE (`const DiceRoller = (function(){...})();`)
 * with no `module.exports`, and it must stay that way since index.html loads it via a
 * plain <script> tag. To reuse it here without changing that shape, we read the file's
 * source text and evaluate it inside a `new Function` wrapper that returns the
 * `DiceRoller` binding it creates. This is a small, self-contained loading shim -- it
 * does not touch dice.js itself.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadDiceRoller() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dice.js'), 'utf8');
  // Evaluate the module source in its own function scope, then hand back the
  // `DiceRoller` const it declares at the top level.
  const factory = new Function(`${src}\nreturn DiceRoller;`);
  return factory();
}

const DiceRoller = loadDiceRoller();

/**
 * Run `fn` with Math.random replaced by a stub that returns the next value
 * from `values` on each call (throwing if the queue runs out), then restores
 * the original Math.random afterwards -- even if `fn` throws.
 * @param {number[]} values - Sequence of [0, 1) values to hand out in order
 * @param {Function} fn - Code to run under the stub
 */
function withStubbedRandom(values, fn) {
  const queue = values.slice();
  const original = Math.random;
  Math.random = () => {
    if (queue.length === 0) {
      throw new Error('withStubbedRandom: ran out of stubbed values');
    }
    return queue.shift();
  };
  try {
    fn();
  } finally {
    Math.random = original;
  }
}

describe('parse() - notations that must keep working', () => {
  test('d20', () => {
    const p = DiceRoller.parse('d20');
    assert.equal(p.valid, true);
    assert.deepEqual(p.diceGroups, [{ count: 1, sides: 20, sign: 1 }]);
    assert.equal(p.modifier, 0);
  });

  test('2d20+5', () => {
    const p = DiceRoller.parse('2d20+5');
    assert.equal(p.valid, true);
    assert.deepEqual(p.diceGroups, [{ count: 2, sides: 20, sign: 1 }]);
    assert.equal(p.modifier, 5);
  });

  test('4d6-1 (trailing modifier, not a subtracted dice group)', () => {
    const p = DiceRoller.parse('4d6-1');
    assert.equal(p.valid, true);
    assert.deepEqual(p.diceGroups, [{ count: 4, sides: 6, sign: 1 }]);
    assert.equal(p.modifier, -1);
  });

  test('d100+2d4', () => {
    const p = DiceRoller.parse('d100+2d4');
    assert.equal(p.valid, true);
    assert.deepEqual(p.diceGroups, [
      { count: 1, sides: 100, sign: 1 },
      { count: 2, sides: 4, sign: 1 }
    ]);
    assert.equal(p.modifier, 0);
  });

  test('2d6+2d6', () => {
    const p = DiceRoller.parse('2d6+2d6');
    assert.equal(p.valid, true);
    assert.deepEqual(p.diceGroups, [
      { count: 2, sides: 6, sign: 1 },
      { count: 2, sides: 6, sign: 1 }
    ]);
    assert.equal(p.modifier, 0);
  });

  test('1d6+11', () => {
    const p = DiceRoller.parse('1d6+11');
    assert.equal(p.valid, true);
    assert.deepEqual(p.diceGroups, [{ count: 1, sides: 6, sign: 1 }]);
    assert.equal(p.modifier, 11);
  });

  test('2d20 + 5 (spaces are stripped)', () => {
    const p = DiceRoller.parse('2d20 + 5');
    assert.equal(p.valid, true);
    assert.deepEqual(p.diceGroups, [{ count: 2, sides: 20, sign: 1 }]);
    assert.equal(p.modifier, 5);
  });

  test('12d10', () => {
    const p = DiceRoller.parse('12d10');
    assert.equal(p.valid, true);
    assert.deepEqual(p.diceGroups, [{ count: 12, sides: 10, sign: 1 }]);
    assert.equal(p.modifier, 0);
  });

  test('1d20+1d6-2 (both groups added, -2 is the modifier)', () => {
    const p = DiceRoller.parse('1d20+1d6-2');
    assert.equal(p.valid, true);
    assert.deepEqual(p.diceGroups, [
      { count: 1, sides: 20, sign: 1 },
      { count: 1, sides: 6, sign: 1 }
    ]);
    assert.equal(p.modifier, -2);
  });
});

describe('parse() - notations that must keep erroring', () => {
  test('empty string', () => {
    assert.equal(DiceRoller.parse('').valid, false);
  });

  test('d5 (unsupported die)', () => {
    assert.equal(DiceRoller.parse('d5').valid, false);
  });

  test('101d6 (count over 100)', () => {
    assert.equal(DiceRoller.parse('101d6').valid, false);
  });

  test('0d6 (count under 1)', () => {
    assert.equal(DiceRoller.parse('0d6').valid, false);
  });

  test('d20xyz (trailing garbage)', () => {
    assert.equal(DiceRoller.parse('d20xyz').valid, false);
  });
});

describe('parse() - signed dice group fix', () => {
  test('2d20-1d6 subtracts the second group', () => {
    const p = DiceRoller.parse('2d20-1d6');
    assert.equal(p.valid, true);
    assert.deepEqual(p.diceGroups, [
      { count: 2, sides: 20, sign: 1 },
      { count: 1, sides: 6, sign: -1 }
    ]);
    assert.equal(p.modifier, 0);
  });

  test('d20-1d4+2 subtracts the second group and keeps the +2 modifier', () => {
    const p = DiceRoller.parse('d20-1d4+2');
    assert.equal(p.valid, true);
    assert.deepEqual(p.diceGroups, [
      { count: 1, sides: 20, sign: 1 },
      { count: 1, sides: 4, sign: -1 }
    ]);
    assert.equal(p.modifier, 2);
  });
});

describe('parse() - modifier accumulation', () => {
  test('2d6+3-1 accumulates to +2', () => {
    const p = DiceRoller.parse('2d6+3-1');
    assert.equal(p.valid, true);
    assert.deepEqual(p.diceGroups, [{ count: 2, sides: 6, sign: 1 }]);
    assert.equal(p.modifier, 2);
  });
});

describe('roll() - deterministic totals via stubbed Math.random', () => {
  test('2d20-1d6: subtracted group lowers the total', () => {
    // rollDie(sides) = floor(random() * sides) + 1
    // d20 rolls: 0.45 -> 10, 0.95 -> 20 (sum 30)
    // d6 roll:   0.40 -> 3
    // total = (10 + 20) - 3 = 27
    withStubbedRandom([0.45, 0.95, 0.4], () => {
      const r = DiceRoller.roll('2d20-1d6');
      assert.equal(r.success, true);
      assert.equal(r.results.length, 2);
      assert.deepEqual(r.results[0].rolls, [10, 20]);
      assert.equal(r.results[0].sum, 30);
      assert.equal(r.results[0].sign, 1);
      assert.deepEqual(r.results[1].rolls, [3]);
      assert.equal(r.results[1].sum, 3);
      assert.equal(r.results[1].sign, -1);
      assert.equal(r.modifier, 0);
      assert.equal(r.total, 27);
    });
  });

  test('d20-1d4+2: subtracted group and a +2 modifier', () => {
    // d20 roll: 0.55 -> 12
    // d4 roll:  0.30 -> 2
    // total = 12 - 2 + 2 = 12
    withStubbedRandom([0.55, 0.3], () => {
      const r = DiceRoller.roll('d20-1d4+2');
      assert.equal(r.success, true);
      assert.deepEqual(r.results[0].rolls, [12]);
      assert.equal(r.results[0].sign, 1);
      assert.deepEqual(r.results[1].rolls, [2]);
      assert.equal(r.results[1].sign, -1);
      assert.equal(r.modifier, 2);
      assert.equal(r.total, 12);
    });
  });

  test('2d6+3: added group with a positive modifier', () => {
    // d6 rolls: 0.55 -> 4, 0.70 -> 5 (sum 9)
    // total = 9 + 3 = 12
    withStubbedRandom([0.55, 0.7], () => {
      const r = DiceRoller.roll('2d6+3');
      assert.equal(r.success, true);
      assert.deepEqual(r.results[0].rolls, [4, 5]);
      assert.equal(r.results[0].sum, 9);
      assert.equal(r.modifier, 3);
      assert.equal(r.total, 12);
    });
  });
});

describe('roll() - every VALID_DICE die stays within 1..sides', () => {
  for (const sides of DiceRoller.VALID_DICE) {
    test(`d${sides} rolls land within [1, ${sides}]`, () => {
      const r = DiceRoller.roll(`20d${sides}`);
      assert.equal(r.success, true);
      for (const value of r.results[0].rolls) {
        assert.ok(value >= 1 && value <= sides, `${value} out of range for d${sides}`);
      }
    });
  }
});

describe('roll() - critical/fumble flags', () => {
  test('lone d20 rolling 20 sets critical, not fumble', () => {
    withStubbedRandom([0.95], () => {
      const r = DiceRoller.roll('d20');
      assert.equal(r.results[0].rolls[0], 20);
      assert.equal(r.critical, true);
      assert.equal(r.fumble, false);
    });
  });

  test('lone d20 rolling 1 sets fumble, not critical', () => {
    withStubbedRandom([0], () => {
      const r = DiceRoller.roll('d20');
      assert.equal(r.results[0].rolls[0], 1);
      assert.equal(r.critical, false);
      assert.equal(r.fumble, true);
    });
  });

  test('2d20 rolling a 20 does NOT set critical (not a lone d20)', () => {
    withStubbedRandom([0.95, 0], () => {
      const r = DiceRoller.roll('2d20');
      assert.deepEqual(r.results[0].rolls, [20, 1]);
      assert.equal(r.critical, false);
      assert.equal(r.fumble, false);
    });
  });
});

describe('formatResult()', () => {
  test('plain roll (no modifier, no sign)', () => {
    withStubbedRandom([0.5], () => {
      const r = DiceRoller.roll('d20');
      assert.equal(DiceRoller.formatResult(r), '[11] = 11');
    });
  });

  test('roll with a positive modifier', () => {
    withStubbedRandom([0.55, 0.7], () => {
      const r = DiceRoller.roll('2d6+3');
      assert.equal(DiceRoller.formatResult(r), '[4, 5] + 3 = 12');
    });
  });

  test('subtracted-group roll renders with a minus', () => {
    withStubbedRandom([0.45, 0.95, 0.4], () => {
      const r = DiceRoller.roll('2d20-1d6');
      assert.equal(DiceRoller.formatResult(r), '[10, 20] - [3] = 27');
    });
  });

  test('critical roll appends the (Critical!) suffix', () => {
    withStubbedRandom([0.95], () => {
      const r = DiceRoller.roll('d20');
      assert.equal(DiceRoller.formatResult(r), '[20] = 20 (Critical!)');
    });
  });

  test('failed roll returns the error string', () => {
    const r = DiceRoller.roll('d5');
    assert.equal(r.success, false);
    assert.equal(DiceRoller.formatResult(r), r.error);
  });
});
