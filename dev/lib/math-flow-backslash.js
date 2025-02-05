/**
 * @typedef {import('micromark-util-types').Construct} Construct
 * @typedef {import('micromark-util-types').State} State
 * @typedef {import('micromark-util-types').TokenizeContext} TokenizeContext
 * @typedef {import('micromark-util-types').Tokenizer} Tokenizer
 */

import {ok as assert} from 'uvu/assert'
import {factorySpace} from 'micromark-factory-space'
import {markdownLineEnding} from 'micromark-util-character'
import {codes} from 'micromark-util-symbol/codes.js'
import {constants} from 'micromark-util-symbol/constants.js'
import {types} from 'micromark-util-symbol/types.js'

/** @type {Construct} */
export const mathFlow = {
  tokenize: tokenizeMathFenced,
  concrete: true
}

/** @type {Construct} */
const nonLazyContinuation = {
  tokenize: tokenizeNonLazyContinuation,
  partial: true
}

/**
 * @this {TokenizeContext}
 * @type {Tokenizer}
 */
function tokenizeMathFenced(effects, ok, nok) {
  const self = this
  const tail = self.events[self.events.length - 1]
  const initialSize =
    tail && tail[1].type === types.linePrefix
      ? tail[2].sliceSerialize(tail[1], true).length
      : 0
  /** @type {number[]} */
  const sizeOpen = []

  return start

  /**
   * Start of math.
   *
   * ```markdown
   * > | $$
   *     ^
   *   | \frac{1}{2}
   *   | $$
   * ```
   *
   * @type {State}
   */
  function start(code) {
    effects.enter('mathFlow')
    effects.enter('mathFlowFence')
    effects.enter('mathFlowFenceSequence')
    return sequenceOpen(code)
  }

  /**
   * In opening fence sequence.
   *
   * ```markdown
   * > | $$
   *      ^
   *   | \frac{1}{2}
   *   | $$
   * ```
   *
   * @type {State}
   */
  function sequenceOpen(code) {
    if (
      code === codes.backslash ||
      (code === codes.leftSquareBracket && sizeOpen[0] === codes.backslash)
    ) {
      effects.consume(code)
      sizeOpen.push(code)
      return sequenceOpen
    }

    if (sizeOpen.length < 2) {
      return nok(code)
    }

    effects.exit('mathFlowFenceSequence')
    return factorySpace(effects, metaBefore, types.whitespace)(code)
  }

  /**
   * In opening fence, before meta.
   *
   * ```markdown
   * > | $$asciimath
   *       ^
   *   | x < y
   *   | $$
   * ```
   *
   * @type {State}
   */

  function metaBefore(code) {
    if (code === codes.eof || markdownLineEnding(code)) {
      return metaAfter(code)
    }

    effects.enter('mathFlowFenceMeta')
    effects.enter(types.chunkString, {contentType: constants.contentTypeString})
    return meta(code)
  }

  /**
   * In meta.
   *
   * ```markdown
   * > | $$asciimath
   *        ^
   *   | x < y
   *   | $$
   * ```
   *
   * @type {State}
   */
  function meta(code) {
    if (code === codes.eof || markdownLineEnding(code)) {
      effects.exit(types.chunkString)
      effects.exit('mathFlowFenceMeta')
      return metaAfter(code)
    }

    if (code === codes.rightSquareBracket) {
      return nok(code)
    }

    effects.consume(code)
    return meta
  }

  /**
   * After meta.
   *
   * ```markdown
   * > | $$
   *       ^
   *   | \frac{1}{2}
   *   | $$
   * ```
   *
   * @type {State}
   */
  function metaAfter(code) {
    // Guaranteed to be eol/eof.
    effects.exit('mathFlowFence')

    if (self.interrupt) {
      return ok(code)
    }

    return effects.attempt(
      nonLazyContinuation,
      beforeNonLazyContinuation,
      after
    )(code)
  }

  /**
   * After eol/eof in math, at a non-lazy closing fence or content.
   *
   * ```markdown
   *   | $$
   * > | \frac{1}{2}
   *     ^
   * > | $$
   *     ^
   * ```
   *
   * @type {State}
   */
  function beforeNonLazyContinuation(code) {
    return effects.attempt(
      {tokenize: tokenizeClosingFence, partial: true},
      after,
      contentStart
    )(code)
  }

  /**
   * Before math content, definitely not before a closing fence.
   *
   * ```markdown
   *   | $$
   * > | \frac{1}{2}
   *     ^
   *   | $$
   * ```
   *
   * @type {State}
   */
  function contentStart(code) {
    return (
      initialSize
        ? factorySpace(
            effects,
            beforeContentChunk,
            types.linePrefix,
            initialSize + 1
          )
        : beforeContentChunk
    )(code)
  }

  /**
   * Before math content, after optional prefix.
   *
   * ```markdown
   *   | $$
   * > | \frac{1}{2}
   *     ^
   *   | $$
   * ```
   *
   * @type {State}
   */
  function beforeContentChunk(code) {
    if (code === codes.eof) {
      return after(code)
    }

    if (markdownLineEnding(code)) {
      return effects.attempt(
        nonLazyContinuation,
        beforeNonLazyContinuation,
        after
      )(code)
    }

    effects.enter('mathFlowValue')
    return contentChunk(code)
  }

  /**
   * In math content.
   *
   * ```markdown
   *   | $$
   * > | \frac{1}{2}
   *      ^
   *   | $$
   * ```
   *
   * @type {State}
   */
  function contentChunk(code) {
    if (code === codes.eof || markdownLineEnding(code)) {
      effects.exit('mathFlowValue')
      return beforeContentChunk(code)
    }

    effects.consume(code)
    return contentChunk
  }

  /**
   * After math (ha!).
   *
   * ```markdown
   *   | $$
   *   | \frac{1}{2}
   * > | $$
   *       ^
   * ```
   *
   * @type {State}
   */
  function after(code) {
    effects.exit('mathFlow')
    return ok(code)
  }

  /** @type {Tokenizer} */
  function tokenizeClosingFence(effects, ok, nok) {
    /** @type {number[]} */
    const size = []

    /**
     * Before closing fence, at optional whitespace.
     *
     * ```markdown
     *   | $$
     *   | \frac{1}{2}
     * > | $$
     *     ^
     * ```
     */
    return factorySpace(
      effects,
      beforeSequenceClose,
      types.linePrefix,
      self.parser.constructs.disable.null.includes('codeIndented')
        ? undefined
        : constants.tabSize
    )

    /**
     * In closing fence, after optional whitespace, at sequence.
     *
     * ```markdown
     *   | $$
     *   | \frac{1}{2}
     * > | $$
     *     ^
     * ```
     *
     * @type {State}
     */
    function beforeSequenceClose(code) {
      effects.enter('mathFlowFence')
      effects.enter('mathFlowFenceSequence')
      return sequenceClose(code)
    }

    /**
     * In closing fence sequence.
     *
     * ```markdown
     *   | $$
     *   | \frac{1}{2}
     * > | $$
     *      ^
     * ```
     *
     * @type {State}
     */
    function sequenceClose(code) {
      if (
        (code === codes.backslash && size.length === 0) ||
        (code === codes.rightSquareBracket && size[0] === codes.backslash)
      ) {
        size.push(code)
        effects.consume(code)
        return sequenceClose
      }

      if (size < sizeOpen) {
        return nok(code)
      }

      effects.exit('mathFlowFenceSequence')
      return factorySpace(effects, afterSequenceClose, types.whitespace)(code)
    }

    /**
     * After closing fence sequence, after optional whitespace.
     *
     * ```markdown
     *   | $$
     *   | \frac{1}{2}
     * > | $$
     *       ^
     * ```
     *
     * @type {State}
     */
    function afterSequenceClose(code) {
      if (code === codes.eof || markdownLineEnding(code)) {
        effects.exit('mathFlowFence')
        return ok(code)
      }

      return nok(code)
    }
  }
}

/**
 * @this {TokenizeContext}
 * @type {Tokenizer}
 */
function tokenizeNonLazyContinuation(effects, ok, nok) {
  const self = this

  return start

  /** @type {State} */
  function start(code) {
    if (code === null) {
      return ok(code)
    }

    assert(markdownLineEnding(code), 'expected eol')
    effects.enter(types.lineEnding)
    effects.consume(code)
    effects.exit(types.lineEnding)
    return lineStart
  }

  /** @type {State} */
  function lineStart(code) {
    return self.parser.lazy[self.now().line] ? nok(code) : ok(code)
  }
}
