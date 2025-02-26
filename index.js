import isRegexp from 'is-regexp';
import isObject from 'is-obj';
import getOwnEnumerableKeys from 'get-own-enumerable-keys';

export default function stringifyObject(input, options, pad) {
	const seen = [];

	return (function stringify(input, options = {}, pad = '') {
		const indent = options.indent || '\t';

		let tokens;
		if (options.inlineCharacterLimit === undefined) {
			tokens = {
				newline: '\n',
				newlineOrSpace: '\n',
				pad,
				indent: pad + indent,
			};
		} else {
			tokens = {
				newline: '@@__STRINGIFY_OBJECT_NEW_LINE__@@',
				newlineOrSpace: '@@__STRINGIFY_OBJECT_NEW_LINE_OR_SPACE__@@',
				pad: '@@__STRINGIFY_OBJECT_PAD__@@',
				indent: '@@__STRINGIFY_OBJECT_INDENT__@@',
			};
		}

		const expandWhiteSpace = string => {
			if (options.inlineCharacterLimit === undefined) {
				return string;
			}

			const oneLined = string
				.replace(new RegExp(tokens.newline, 'g'), '')
				.replace(new RegExp(tokens.newlineOrSpace, 'g'), ' ')
				.replace(new RegExp(tokens.pad + '|' + tokens.indent, 'g'), '');

			if (oneLined.length <= options.inlineCharacterLimit) {
				return oneLined;
			}

			return string
				.replace(new RegExp(tokens.newline + '|' + tokens.newlineOrSpace, 'g'), '\n')
				.replace(new RegExp(tokens.pad, 'g'), pad)
				.replace(new RegExp(tokens.indent, 'g'), pad + indent);
		};

		if (seen.includes(input)) {
			return '"[Circular]"';
		}

		if (
			input === null
			|| input === undefined
			|| typeof input === 'number'
			|| typeof input === 'boolean'
			|| isRegexp(input)
		) {
			return String(input);
		}

		if (typeof input === 'function') {
			const method = isMethodFunction(input);
			if (method) {
				const fn = input.constructor.name;
				if (fn.slice(0,5) === 'Async') {
					return 'async function' + method.slice(5);
				}
				return 'function ' + method;
			}
			return String(input);
		}

		if (typeof input === 'symbol') {
			const t = input.description;
			if (t === undefined) return 'Symbol()';
			if (t.slice(0,7) === 'Symbol.'
				&& Symbol[t.slice(7)] === input
			) {
				return t;
			}
			const q = stringify(t, options);
			if (Symbol.keyFor(input) !== undefined) {
				return `Symbol.for(${q})`;
			}
			return `Symbol(${q})`;
		}

		if (input instanceof Date) {
			return `new Date('${input.toISOString()}')`;
		}

		if (Array.isArray(input)) {
			if (input.length === 0) {
				return '[]';
			}

			seen.push(input);

			const returnValue = '[' + tokens.newline + input.map((element, i) => {
				const eol = input.length - 1 === i ? tokens.newline : ',' + tokens.newlineOrSpace;

				let value = stringify(element, options, pad + indent);
				if (options.transform) {
					value = options.transform(input, i, value);
				}

				return tokens.indent + value + eol;
			}).join('') + tokens.pad + ']';

			seen.pop();

			return expandWhiteSpace(returnValue);
		}

		if (isObject(input)) {
			let objectKeys = getOwnEnumerableKeys(input);

			if (options.filter) {
				// eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument
				objectKeys = objectKeys.filter(element => options.filter(input, element));
			}

			if (objectKeys.length === 0) {
				return '{}';
			}

			seen.push(input);

			const returnValue = '{' + tokens.newline + objectKeys.map((element, index) => {
				const eol = objectKeys.length - 1 === index ? tokens.newline : ',' + tokens.newlineOrSpace;
				const isSymbol = typeof element === 'symbol';
				const isClassic = !isSymbol && /^[a-z$_][$\w]*$/i.test(element);
				let key = element;
				if (!isClassic) key = stringify(element, options);
				if (isSymbol) key = '[' + key + ']';

				let value = stringify(input[element], options, pad + indent);
				if (options.transform) {
					value = options.transform(input, element, value);
				}

				const method = isMethodFunction(input[element]);
				if (method) return tokens.indent + method + eol;

				return tokens.indent + String(key) + ': ' + value + eol;
			}).join('') + tokens.pad + '}';

			seen.pop();

			return expandWhiteSpace(returnValue);
		}

		input = input.replace(/\\/g, '\\\\');
		input = String(input).replace(/[\r\n]/g, x => x === '\n' ? '\\n' : '\\r');

		if (options.singleQuotes === false) {
			input = input.replace(/"/g, '\\"');
			return `"${input}"`;
		}

		input = input.replace(/'/g, '\\\'');
		return `'${input}'`;
	})(input, options, pad);
}

export function isMethodFunction(f) {
	if (typeof f !== 'function') return null;

	const fn = f.constructor.name;
	const source = String(f);
	let s = source;

	// comment, async, variable, =>
	const comment = /^(\s+|\/\/.*\n|\/\*.*?\*\/)*/;
	const variable = /^[_$a-zA-Z0-9]+/;
	const arrow = /^=>/;
	const func = /^function(\s|\(|\/|\*)/;
	const clas = /^class(\s|\{|\/|\*)/;

	if (fn == 'AsyncFunction' || fn == 'AsyncGeneratorFunction') {
		s = s.slice(5).replace(comment, '');
	}
	if (s.charAt(0) === '(') {
		// (...) => ...
		return null;
	}
	if (func.test(s) && f.name !== 'function') {
		// exclude function as method name {function() {}}
		return null;
	}
	if (clas.test(s) && f.name !== 'class') {
		// exclude class as method name {class() {}}
		return null;
	}
	if (variable.test(s)) {
		// remove x of `x => {}`
		s = s.replace(variable, '').replace(comment, '');
		if (arrow.test(s)) return null;
	}
	return source;
}
