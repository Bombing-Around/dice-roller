/**
 * Dice Parser and Roller
 * Supports notation like: 2d20, 1d6+3, 4d6-1, d100, 2d20+1d4+5
 */

const DiceRoller = (function() {
  // Supported dice types
  const VALID_DICE = [4, 6, 8, 10, 12, 16, 20, 100];
  
  /**
   * Parse a dice notation string into components
   * @param {string} notation - e.g., "2d20+5", "4d6-1", "d100+2d4"
   * @returns {object} Parsed result with dice groups (each carrying a
   *   `sign` of +1 or -1 for the group's contribution) and modifier
   */
  function parse(notation) {
    if (!notation || typeof notation !== 'string') {
      return { valid: false, error: 'Invalid notation' };
    }
    
    // Normalize: lowercase, remove spaces
    const normalized = notation.toLowerCase().replace(/\s+/g, '');
    
    if (!normalized) {
      return { valid: false, error: 'Empty notation' };
    }
    
    // Match dice groups and modifiers
    // Regex: captures a leading +/- sign (optional), count (optional),
    // 'd', and sides. Capturing the sign here (instead of leaving it for
    // the leftover-modifier pass below) is what lets a subtracted dice
    // group, e.g. "-1d6", be told apart from an added one.
    const dicePattern = /([+-]?)(\d*)d(\d+)/g;
    const modifierPattern = /([+-]\d+)(?!d)/g;

    const diceGroups = [];
    let match;
    let lastIndex = 0;
    let remaining = normalized;

    // Extract all dice groups
    while ((match = dicePattern.exec(normalized)) !== null) {
      const sign = match[1] === '-' ? -1 : 1;
      const count = match[2] ? parseInt(match[2], 10) : 1;
      const sides = parseInt(match[3], 10);

      // Validate dice type
      if (!VALID_DICE.includes(sides)) {
        return {
          valid: false,
          error: `Invalid dice type: d${sides}. Supported: ${VALID_DICE.map(d => 'd' + d).join(', ')}`
        };
      }

      // Validate count
      if (count < 1 || count > 100) {
        return { valid: false, error: 'Dice count must be between 1 and 100' };
      }

      diceGroups.push({ count, sides, sign });
      remaining = remaining.replace(match[0], '');
    }
    
    // Extract modifier (final +/- number)
    let modifier = 0;
    const modMatches = remaining.match(/^[+-]?\d+$|([+-]\d+)/g);
    if (modMatches) {
      modMatches.forEach(m => {
        modifier += parseInt(m, 10);
      });
      remaining = remaining.replace(/[+-]?\d+/g, '');
    }
    
    // Remove any remaining + or - signs
    remaining = remaining.replace(/[+-]/g, '');
    
    // Check if there's any invalid content left
    if (remaining.length > 0) {
      return { valid: false, error: `Invalid characters in notation: ${remaining}` };
    }
    
    // Must have at least one dice group
    if (diceGroups.length === 0) {
      return { valid: false, error: 'No valid dice found in notation' };
    }
    
    return {
      valid: true,
      diceGroups,
      modifier,
      notation: normalized
    };
  }
  
  /**
   * Roll a single die
   * @param {number} sides - Number of sides on the die
   * @returns {number} Random result from 1 to sides
   */
  function rollDie(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }
  
  /**
   * Roll dice based on parsed notation
   * @param {string} notation - Dice notation string
   * @returns {object} Roll results
   */
  function roll(notation) {
    const parsed = parse(notation);
    
    if (!parsed.valid) {
      return {
        success: false,
        error: parsed.error
      };
    }
    
    const results = [];
    let subtotal = 0;
    
    // Roll each dice group
    for (const group of parsed.diceGroups) {
      const groupResults = [];
      for (let i = 0; i < group.count; i++) {
        const result = rollDie(group.sides);
        groupResults.push(result);
      }
      const sum = groupResults.reduce((a, b) => a + b, 0);
      // `sum` stays unsigned (the raw total of the pips rolled); the
      // group's sign is applied only when folding it into the subtotal.
      subtotal += group.sign * sum;
      results.push({
        dice: `${group.count}d${group.sides}`,
        sides: group.sides,
        sign: group.sign,
        rolls: groupResults,
        sum
      });
    }
    
    const total = subtotal + parsed.modifier;
    
    // Check for critical/fumble on d20 rolls
    let critical = false;
    let fumble = false;
    if (results.length === 1 && results[0].sides === 20 && results[0].rolls.length === 1) {
      critical = results[0].rolls[0] === 20;
      fumble = results[0].rolls[0] === 1;
    }
    
    return {
      success: true,
      notation: parsed.notation,
      results,
      modifier: parsed.modifier,
      total,
      critical,
      fumble
    };
  }
  
  /**
   * Format roll results for display
   * @param {object} rollResult - Result from roll()
   * @returns {string} Formatted string
   */
  function formatResult(rollResult) {
    if (!rollResult.success) {
      return rollResult.error;
    }
    
    let str = '';

    rollResult.results.forEach((group, index) => {
      const bracket = group.rolls.length === 1
        ? `[${group.rolls[0]}]`
        : `[${group.rolls.join(', ')}]`;
      const isNegative = group.sign === -1;

      if (index === 0) {
        str = isNegative ? `-${bracket}` : bracket;
      } else {
        str += isNegative ? ` - ${bracket}` : ` + ${bracket}`;
      }
    });

    if (rollResult.modifier !== 0) {
      str += rollResult.modifier > 0 ? ` + ${rollResult.modifier}` : ` - ${Math.abs(rollResult.modifier)}`;
    }
    
    str += ` = ${rollResult.total}`;
    
    if (rollResult.critical) {
      str += ' (Critical!)';
    } else if (rollResult.fumble) {
      str += ' (Fumble!)';
    }
    
    return str;
  }
  
  // Public API
  return {
    parse,
    roll,
    formatResult,
    VALID_DICE
  };
})();
