import objectAssign from 'object-assign';

import {isReduced} from './reduced';
import {isNone} from '../$none';
import getTypeErrorMessage from './getTypeErrorMessage';
import normalizeIndex, {normalizeEnd} from './normalizeIndex';
import unwrapMacro from '../macros/unwrap.macro';
import isWrappedMacro from '../macros/isWrapped.macro';
import isWrappedUnsafeMacro from '../macros/isWrappedUnsafe.macro';

const cloneEmptyObject = object =>
  Object.create((object.constructor && object.constructor.prototype) || null);

const isInteger = value => {
  if (isNaN(value)) {
    return !1;
  } else {
    let x = parseFloat(value);
    return (0 | x) === x;
  }
};

const eachFlattenedKey = (fn, keys, object) => {
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (Array.isArray(key)) {
      for (let j = 0; j < key.length; j++) {
        const subKey = key[j];
        if (subKey in object) {
          fn(subKey);
        }
      }
    } else {
      if (key in object) {
        fn(key);
      }
    }
  }
};

export const isWrappedUnsafe = (source) =>
  isWrappedUnsafeMacro(source);

export const isWrapped = (source) =>
  isWrappedMacro(source);

let Wrapper;

export const wrap = (source) =>
  isWrappedMacro(source) ?
    source :
    new Wrapper(source);

export const unwrap = (wrapped) =>
  unwrapMacro(wrapped);

const replaceSliceOfArray = (begin, end, newSlice, source) => {
  const sliceBegin = normalizeIndex(begin, source.length, 0);
  const sliceEnd = normalizeIndex(end, source.length, source.length);
  newSlice = unwrap(newSlice);
  newSlice = newSlice === undefined ? [] : newSlice;
  const newArray = [];
  for (let i = 0; i < sliceBegin; i++) {
    newArray.push(source[i]);
  }
  newSlice = [].concat(newSlice);
  for (let i = 0; i < newSlice.length; i++) {
    newArray.push(newSlice[i]);
  }
  for (let i = sliceEnd; i < source.length; i++) {
    newArray.push(source[i]);
  }
  return newArray;
};

Wrapper = function (source, type) {
  this['@@qim/wrap'] = true;
  this._type = type;
  this._source = source;
  this._hasMutated = false;
};

const PRIMITIVE_TYPE = 0;
const OBJECT_TYPE = 1;
const ARRAY_TYPE = 2;
const STRING_TYPE = 3;

const baseMethods = {
  type() {
    return this._type;
  },
  has(key) {
    return key in this._source;
  },
  get(key) {
    return this._source[key];
  },
  value() {
    return this._source;
  },
  append() {
    throw new Error(getTypeErrorMessage('append', ['appendable sequence'], this._source));
  },
  appendHole() {
    return this.append();
  },
  canAppend() {
    return false;
  },
  reduce() {
    throw new Error(getTypeErrorMessage('reduce', ['appendable sequence'], this._source));
  }
};

const appendableMethods = {
  canAppend() {
    return true;
  }
};

const sequenceMethods = {
  reduce(fn, initial) {
    let accum = initial;
    this.forEach((value, key) => {
      accum = fn(accum, value, key);
      if (isReduced(accum)) {
        return false;
      }
      return undefined;
    });
    return accum;
  }
};

const methods = [];

const mix = (...moreMethods) => objectAssign({}, ...moreMethods);

methods[PRIMITIVE_TYPE] = mix(baseMethods, {
  has() {
    return false;
  },
  get() {
    return undefined;
  },
  set() {
    return this;
  },
  delete() {
    return this;
  },
  sliceToValue() {
    throw new Error(getTypeErrorMessage('sliceToValue', ['sequence'], this._source));
  },
  pickToValue() {
    throw new Error(getTypeErrorMessage('pickToValue', ['sequence'], this._source));
  }
});

methods[OBJECT_TYPE] = mix(baseMethods, sequenceMethods, {
  delete(key) {
    if (!this._hasMutated) {
      const source = this._source;
      if (!(key in source)) {
        return this;
      }
      this._source = objectAssign(cloneEmptyObject(source), source);
      this._hasMutated = true;
    }
    delete this._source[key];
    return this;
  },
  set(key, value) {
    if (isNone(key)) {
      return this;
    }
    if (isNone(value)) {
      return this.delete(key);
    }
    if (!this._hasMutated) {
      const source = this._source;
      if (source[key] === value) {
        return this;
      }
      this._source = objectAssign(cloneEmptyObject(source), source);
      this._hasMutated = true;
    }
    this._source[key] = value;
    return this;
  },
  sliceToValue(begin, end) {
    const keys = Object.keys(this._source);
    begin = normalizeEnd(begin, keys.length);
    end = normalizeEnd(end, keys.length);
    return keys.slice(begin, end).reduce((result, key) => {
      result[key] = this._source[key];
      return result;
    }, {});
  },
  pickToValue(keys) {
    const picked = {};
    eachFlattenedKey((key) => {
      picked[key] = this._source[key];
    }, keys, this._source);
    return picked;
  },
  cloneEmpty() {
    const empty = new Wrapper(cloneEmptyObject(this._source), OBJECT_TYPE);
    empty._hasMutated = true;
    return empty;
  },
  forEach(fn) {
    const source = this._source;
    for (let key in source) {
      if (source.hasOwnProperty(key)) {
        const shouldContinue = fn(source[key], key);
        if (shouldContinue === false) {
          break;
        }
      }
    }
  }
});

methods[ARRAY_TYPE] = mix(baseMethods, sequenceMethods, appendableMethods, {
  set(key, value) {
    if (isNone(key)) {
      return this;
    }
    if (isNone(value)) {
      return this.delete(key);
    }
    if (!this._hasMutated) {
      const source = this._source;
      if (source[key] === value) {
        return source;
      }
      this._source = source.slice(0);
      this._hasMutated = true;
    }
    this._source[key] = value;
    return this;
  },
  delete(key, shouldLeaveHole) {
    if (!this._hasMutated) {
      const source = this._source;
      if (!(key in source)) {
        return this;
      }
      this._source = source.slice(0);
      this._hasMutated = true;
    }
    if (isInteger(key) && !shouldLeaveHole) {
      this._source.splice(key, 1);
    } else {
      delete this._source[key];
    }
    return this;
  },
  sliceToValue(begin, end) {
    const source = this._source;
    end = normalizeEnd(end, source.length);
    begin = normalizeEnd(begin, source.length);
    return source.slice(begin, end);
  },
  pickToValue(keys) {
    const picked = [];
    eachFlattenedKey((key) => {
      picked.push(this._source[key]);
    }, keys, this._source);
    return picked;
  },
  replaceSlice(begin, end, newSlice) {
    return replaceSliceOfArray(begin, end, newSlice, this._source);
  },
  cloneEmpty() {
    const empty = new Wrapper([], ARRAY_TYPE);
    empty._hasMutated = true;
    return empty;
  },
  forEach(fn) {
    const source = this._source;
    for (var i = 0; i < source.length; i++) {
      const shouldContinue = fn(source[i], i);
      if (shouldContinue === false) {
        break;
      }
    }
  },
  append(value) {
    if (isNone(value)) {
      return this;
    }
    if (!this._hasMutated) {
      this._source = this._source.slice(0);
      this._hasMutated = true;
    }
    this._source.push(value);
    return this;
  },
  appendHole() {
    if (!this._hasMutated) {
      this._source = this._source.slice(0);
      this._hasMutated = true;
    }
    this._source.length = this._source.length + 1;
    return this;
  }
});

methods[STRING_TYPE] = mix(baseMethods, sequenceMethods, appendableMethods, {
  has(key) {
    if (isInteger(key)) {
      return this._source.charAt(key) !== '';
    }
    return false;
  },
  get(key) {
    if (isInteger(key)) {
      return this._source.charAt(key);
    }
    return undefined;
  },
  set(key, value) {
    if (isNone(key)) {
      return this;
    }
    if (isNone(value)) {
      value = '';
    }
    if (isInteger(key)) {
      const source = this._source;
      if (source.charAt(key) === '') {
        return this;
      }
      if (typeof value === 'string') {
        this._source = source.substr(0, key) + value + source.substr(key + 1);
      }
    }
    return this;
  },
  delete(key) {
    return this.set(key, '');
  },
  sliceToValue(begin, end) {
    const source = this._source;
    end = normalizeEnd(end, source.length);
    begin = normalizeEnd(begin, source.length);
    return source.substr(begin, end);
  },
  pickToValue(keys) {
    let picked = '';
    eachFlattenedKey((key) => {
      if (isInteger(key)) {
        picked += this._source[key] || '';
      }
    }, keys, this._source);
    return picked;
  },
  cloneEmpty() {
    const empty = new Wrapper('', STRING_TYPE);
    empty._hasMutated = true;
    return empty;
  },
  forEach(fn) {
    const source = this._source;
    for (var i = 0; i < source.length; i++) {
      const shouldContinue = fn(source[i], i);
      if (shouldContinue === false) {
        break;
      }
    }
  },
  append(value) {
    this._source += value;
    return this;
  }
});

const getType = (source) => {
  if (typeof source === 'object') {
    if (Array.isArray(source)) {
      return ARRAY_TYPE;
    }
    return OBJECT_TYPE;
  }
  if (typeof source === 'string') {
    return STRING_TYPE;
  }
  return PRIMITIVE_TYPE;
};

const setMethod = (wrapper, methodKey) => {
  if (wrapper._type === undefined) {
    wrapper._type = getType(wrapper._source);
  }
  wrapper[methodKey] = methods[wrapper._type][methodKey];
};

Wrapper.prototype = {
  type() {
    setMethod(this, 'type');
    return this._type;
  },
  value() {
    return this._source;
  },
  has(key) {
    setMethod(this, 'has');
    return this.has(key);
  },
  get(key) {
    setMethod(this, 'get');
    return this.get(key);
  },
  set(key, value) {
    setMethod(this, 'set');
    return this.set(key, value);
  },
  delete(key) {
    setMethod(this, 'delete');
    return this.delete(key);
  },
  sliceToValue(begin, end) {
    setMethod(this, 'sliceToValue');
    return this.sliceToValue(begin, end);
  },
  replaceSlice(begin, end, newSlice) {
    setMethod(this, 'replaceSlice');
    return this.replaceSlice(begin, end, newSlice);
  },
  pickToValue(keys) {
    setMethod(this, 'pickToValue');
    return this.pickToValue(keys);
  },
  cloneEmpty() {
    setMethod(this, 'cloneEmpty');
    return this.cloneEmpty();
  },
  forEach(fn) {
    setMethod(this, 'forEach');
    return this.forEach(fn);
  },
  reduce(fn, initial) {
    setMethod(this, 'reduce');
    return this.reduce(fn, initial);
  },
  append(value) {
    setMethod(this, 'append');
    return this.append(value);
  },
  appendHole(value) {
    setMethod(this, 'appendHole');
    return this.appendHole(value);
  },
  canAppend() {
    setMethod(this, 'canAppend');
    return this.canAppend();
  }
};

const delegateMethods = {
  type() {
    if (isWrappedMacro(this._source)) {
      this._type = this._source.type();
    }
    setMethod(this, 'type');
    return this._type;
  }
};

const SliceWrapper = function (source, begin, end) {
  this['@@qim/wrap'] = true;
  this._source = source;
  this._hasMutated = false;
  this._begin = begin;
  this._end = end;
};

export const wrapSlice = (source, begin, end) => new SliceWrapper(source, begin, end);

SliceWrapper.prototype = mix(delegateMethods, {
  value() {
    if (isWrappedMacro(this._source)) {
      this._source = this._source.value();
    }
    setMethod(this, 'sliceToValue');
    this._source = this.sliceToValue(this._begin, this._end);
    setMethod(this, 'value');
    return this._source;
  },
});

const PickWrapper = function (source, properties) {
  this['@@qim/wrap'] = true;
  this._source = source;
  this._hasMutated = false;
  this._properties = properties;
};

export const wrapPick = (source, properties) => new PickWrapper(source, properties);

PickWrapper.prototype = mix(delegateMethods, {
  value() {
    if (isWrappedMacro(this._source)) {
      this._source = this._source.value();
    }
    setMethod(this, 'pickToValue');
    this._source = this.pickToValue(this._properties);
    setMethod(this, 'value');
    return this._source;
  },
});

export const isNil = value => value == null;

export const hasPropertyUnsafe = (key, source) => {
  if (typeof source == 'object') {
    if (isWrappedUnsafe(source)) {
      return source.has(key);
    }
    return key in source;
  }
  if (typeof source === 'string') {
    if (isInteger(key)) {
      return source.charAt(key) !== '';
    }
  }
  return false;
};

export const hasProperty = (key, source) => {
  if (source === null) {
    return false;
  }
  return hasPropertyUnsafe(key, source);
};

const getProperty_Wrapper = (key, source) => source.get(key);

const getProperty_Object = (key, source) => source[key];

const getProperty_Array = (key, source) => source[key];

export const getProperty = (key, source) => {
  if (typeof source === 'object') {
    if (isWrappedUnsafe(source)) {
      return source.get(key);
    }
    return source[key];
  }
  if (typeof source === 'string') {
    if (isInteger(key)) {
      return source.charAt(key);
    }
  }
  return undefined;
};

const setProperty_Wrapper = (key, value, source) => source.set(key, value);

const setProperty_Object = (key, value, source) => {
  if (source[key] === value) {
    return source;
  }
  source = objectAssign({}, source);
  source[key] = value;
  return source;
};

const setProperty_Array = (key, value, source) => {
  if (source[key] === value) {
    return source;
  }
  source = source.slice(0);
  source[key] = value;
  return source;
};

export const setProperty = (key, value, source) => {
  if (typeof source === 'object') {
    if (isWrappedUnsafe(source)) {
      return source.set(key, value);
    }
    if (source[key] === value && key in source) {
      return source;
    }
    if (Array.isArray(source)) {
      source = source.slice(0);
    } else {
      source = objectAssign({}, source);
    }
    source[key] = value;
    return source;
  }
  if (typeof source === 'string') {
    if (isInteger(key)) {
      if (source.charAt(key) !== '') {
        return source;
      }
      if (typeof value === 'string') {
        return source.substr(0, key) + value + source.substr(key + 1);
      }
    }
  }
  return source;
};

const deleteProperty_Wrapper = (key, source) => source.delete(key);

const deleteProperty_Object = (key, source) => {
  if (!(key in source)) {
    return source;
  }
  source = objectAssign({}, source);
  delete source[key];
  return source;
};

const deleteProperty_Array = (key, source) => {
  if (!(key in source)) {
    return source;
  }
  source = source.slice(0);
  if (key in source) {
    source.splice(key, 1);
  }
  return source;
};

export const deleteProperty = (key, source) => {
  if (typeof source === 'object') {
    if (isWrappedUnsafe(source)) {
      return source.delete(key);
    }
    if (Array.isArray(source)) {
      if (!(key in source)) {
        return source;
      }
      source = source.slice(0);
      // Could have a silly edge here where nav was a property and not an
      // index, which means it disappears. If it's still here, that means
      // it's an index.
      if (key in source) {
        source.splice(key, 1);
      }
      return source;
    }
    if (!(key in source)) {
      return source;
    }
    source = objectAssign(cloneEmptyObject(source), source);
    delete source[key];
    return source;
  }
  if (typeof source === 'string') {
    if (isInteger(key)) {
      if (source.charAt(key) === '') {
        return source;
      }
      return source.substr(0, key) + source.substr(key + 1);
    }
  }
  return source;
};

// TODO: isNone
// TODO: check for empty newSlice
// TODO: order keys correctly with object slice
// TODO: null/undefined
export const replaceSlice = (begin, end, newSlice, source) => {
  if (typeof source === 'object') {
    if (isWrappedUnsafe(source)) {
      return source.replaceSlice(begin, end, newSlice);
    }
    if (Array.isArray(source)) {
      return replaceSliceOfArray(begin, end, newSlice, source);
    }
    newSlice = newSlice === undefined ? {} : newSlice;
    if (typeof newSlice !== 'object') {
      throw new Error('No way to splice a non-object into an object.');
    }
    const keys = Object.keys(source);
    const sliceBegin = normalizeIndex(begin, keys.length, 0);
    const sliceEnd = normalizeIndex(end, keys.length, keys.length);
    const newObject = {};
    for (let i = 0; i < sliceBegin; i++) {
      newObject[keys[i]] = source[keys[i]];
    }
    for (let i = sliceEnd; i < keys.length; i++) {
      newObject[keys[i]] = source[keys[i]];
    }
    objectAssign(newObject, newSlice);
    return newObject;
  }
  if (typeof source === 'string') {
    const sliceBegin = normalizeIndex(begin, source.length, 0);
    const sliceEnd = normalizeIndex(end, source.length, source.length);
    return source.substr(0, sliceBegin) + newSlice + source.substr(sliceEnd);
  }
  throw new Error(getTypeErrorMessage('replaceSlice', ['sequence'], source));
};

// TODO: isNone
// TODO: strings
// TODO: null/undefined
export const replacePick = (properties, newPick, source) => {
  if (typeof source === 'object') {
    if (isWrappedUnsafe(source)) {
      return source.replacePick(properties, newPick, source);
    }
    if (Array.isArray(source)) {
      newPick = newPick === undefined ? [] : newPick;
      const newArray = [];
      return newArray;
    }
    newPick = unwrap(newPick);
    newPick = newPick === undefined ? {} : newPick;
    const newObject = {...source};
    eachFlattenedKey((key) => {
      delete newObject[key];
    }, properties, source);
    objectAssign(newObject, newPick);
    return newObject;
  }
  if (typeof source === 'string') {
    // not implemented
  }
  throw new Error(getTypeErrorMessage('replacePick', ['sequence'], source));
};

// TODO: wrapper
// TODO: strings
export const reduceSequence = (eachFn, initialValue, seq) => {
  let result = initialValue;
  if (Array.isArray(seq)) {
    for (let i = 0; i < seq.length; i++) {
      result = eachFn(result, i);
      if (isReduced(result)) {
        return result;
      }
    }
  } else if (seq !== null && typeof seq === 'object') {
    for (let key in seq) {
      if (seq.hasOwnProperty(key)) {
        result = eachFn(result, key);
        if (isReduced(result)) {
          return result;
        }
      }
    }
  } else {
    throw new Error(getTypeErrorMessage('reduceSequence', ['sequence'], seq));
  }
  return result;
};

const baseSpec = {
  isNil: false
};

const wrapperSpec = mix(baseSpec, {
  get: getProperty_Wrapper,
  set: setProperty_Wrapper,
  delete: deleteProperty_Wrapper,
});

const objectSpec = mix(baseSpec, {
  get: getProperty_Object,
  set: setProperty_Object,
  delete: deleteProperty_Object
});

const arraySpec = {
  isNull: false,
  get: getProperty_Array,
  set: setProperty_Array,
  delete: deleteProperty_Array
};

const stringSpec = mix(baseSpec, {

});

const primitiveSpec = mix(baseSpec, {

});

const nilSpec = mix(baseSpec, primitiveSpec, {
  isNil: true
});

export const getSpec = (source) => {
  if (source == null) {
    return nilSpec;
  }
  if (typeof source === 'object') {
    if (isWrappedUnsafeMacro(source)) {
      return wrapperSpec;
    }
    if (typeof source.length !== 'number') {
      return objectSpec;
    }
    if (Array.isArray(source)) {
      return arraySpec;
    }
    return objectSpec;
  }
  if (typeof source === 'string') {
    return stringSpec;
  }
  return primitiveSpec;
};