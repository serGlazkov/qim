import copy from './utils/copy';
import {updateKey} from './$traverse';
import {traverseEach} from './traverse';
import {curry3} from './utils/curry';
import {undefinedIfNone} from './$none';

const set = (path, value, obj) => {

  // Optimized case for a single primitive key.
  if (!path || typeof path !== 'object') {
    if (obj == null || typeof obj !== 'object') {
      return obj;
    }

    if (obj[path] === value) {
      return obj;
    }

    obj = copy(obj);

    obj[path] = value;

    return obj;
  }

  path = Array.isArray(path) ? path : [path];

  return undefinedIfNone(traverseEach(updateKey, undefined, undefined, path, obj, 0, () => value));
};

export default curry3(set);
