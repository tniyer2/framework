
const fm = (function(){
const exports = {};

const noop = function(){};
const isUdf = (a) => typeof a === 'undefined';
const isNull = (a) => a === null;
const isFunction = (a) => typeof a === 'function';

const removeItem = (a, item) => {
    let i = a.indexOf(item);
    if (i < 0 || i >= a.length) return;

    const stop = a.length - 1;
    while (i < stop) {
        a[i] = a[++i];
    }
    a.pop();
};

let ATOM_UPDATE_SCHEDULED = false;
const ATOM_STACK = [];

const updateAtoms = () => {
    for (let i = 0; i < ATOM_STACK.length; i++) {
        const deps = ATOM_STACK[i][0];
        const atom = ATOM_STACK[i][1];

        if (isNull(deps)) { // if a source atom.
            if (atom._dirty) {
                atom._update();
            }
        }
        else { // if a derived atom.
            if (deps.some((a) => a._dirty)) {
                atom._update();
            }
        }
    }

    for (let i = 0; i < ATOM_STACK.length; i++) {
        const atom = ATOM_STACK[i][1];
        atom._dirty = false;
    }
};

const scheduleAtomUpdate = () => {
    if (ATOM_UPDATE_SCHEDULED) return;
    ATOM_UPDATE_SCHEDULED = true;

    setTimeout(() => {
        ATOM_UPDATE_SCHEDULED = false; // this should be before so that side effect schedule another update.
        updateAtoms();
    });
};

exports.atom = function(valueArg, deps) {
    let _value;

    const _callbacks = [];
    const _callCallbacks = () => {
        for (let i = 0; i < _callbacks.length; i++) {
            _callbacks[i](_value);
        }
    };

    const atom = () => _value;
    atom._type = 'atom';
    atom._dirty = false;
    atom.listen = (newCallback) => {
        _callbacks.push(newCallback);
        return () => {
            removeItem(_callbacks, newCallback);
        };
    };

    if (isUdf(deps)) deps = null;
    if (isNull(deps)) { // if a source atom.
        _value = valueArg;

        atom.update = (newValue) => {
            _value = newValue;
            atom._dirty = true;
            scheduleAtomUpdate();
        };

        atom._update = _callCallbacks; // gets called during next update.
    }
    else { // if a derived atom.
        // deps should be a non-empty array and
        // valueArg should be a function.

        _value = valueArg(...(deps.map((a) => a())));

        atom._update = () => {
            _value = valueArg(...(deps.map((a) => a())));
            atom._dirty = true;
            _callCallbacks(); // gets called immediately.
        };
    }

    const _stackEntry = [deps, atom];

    atom._remove = () => {
        removeItem(ATOM_STACK, _stackEntry);
    };

    ATOM_STACK.push(_stackEntry);

    return atom;
};

const startsWith_on = (s) => s[0] === 'o' && s[1] === 'n';

exports.createElement = function(tagName, props, children) {
    let _domElement;
    let _anchor;

    const _propKeys = isNull(props) ? null : Object.keys(props);

    const _disposeCallbacks = [];

    const vDomNode = {
        create: () => {
            _domElement = document.createElement(tagName);

            if (!isNull(props)) {
                for (let i = 0; i < _propKeys.length; i++) {
                    const attrib = _propKeys[i];
                    const prop = props[attrib];

                    if (prop._type === 'atom') { // if a dynamic attribute.
                        _disposeCallbacks.push(prop.listen((newValue) => {
                            _domElement.setAttribute(attrib, newValue);
                        }));
                    }
                    else if (startsWith_on(attrib)) { // if an event listener attribute.
                        const type = attrib.slice(2).toLowerCase();
                        _domElement.addEventListener(type, prop);
                    }
                    else { // if a static attribute.
                        _domElement.setAttribute(attrib, prop);
                    }
                }
            }

            if (!isNull(children)) {
                for (let i = 0; i < children.length; i++) {
                    children[i].create();
                }
            }
        },
        mount: (anchor) => {
            _anchor = anchor;
            _anchor.appendChild(_domElement);

            if (!isNull(children)) {
                for (let i = 0; i < children.length; i++) {
                    children[i].mount(_domElement);
                }
            }
        },
        unmount: () => {
            for (let i = 0; i < _disposeCallbacks.length; i++) {
                _disposeCallbacks[i]();
            }

            _anchor.removeChild(_domElement);

            if (!isNull(children)) {
                for (let i = 0; i < children.length; i++) {
                    children[i].unmount();
                }
            }
        }
    };
    
    vDomNode.type = 'element';

    return vDomNode;
};

exports.createText = function(textArg) {
    let _domTextNode;
    let _anchor;

    let _dispose = null;

    const vDomNode = {
        create: () => {
            if (textArg._type === 'atom') {
                _domTextNode = document.createTextNode(textArg());
            }
            else {
                _domTextNode = document.createTextNode(textArg);
            }
        },
        mount: (anchor) => {
            _anchor = anchor;

            if (textArg._type === 'atom') {
                _dispose = textArg.listen((newValue) => {
                    _domTextNode.nodeValue = newValue;
                });
            }

            _anchor.appendChild(_domTextNode);
        },
        unmount: () => {
            if (!isNull(_dispose)) _dispose();

            _anchor.removeChild(_domTextNode);
        }
    };

    vDomNode.type = 'text'
    
    return vDomNode;
};

let CURRENT_INITIALIZING_COMPONENT = null;

exports.component = function(initFunc) {
    const vDomNode = { _onMountHook: null, _onUnmountHook: null, _atoms: [] };

    CURRENT_INITIALIZING_COMPONENT = vDomNode;
    const _childVDomNode = initFunc();
    CURRENT_INITIALIZING_COMPONENT = null;

    vDomNode.create = () => {
        _childVDomNode.create();
    };

    vDomNode.mount = (anchor) => {
        _childVDomNode.mount(anchor);

        if (!isNull(vDomNode._onMountHook))
            vDomNode._onMountHook();
    };

    vDomNode.unmount = () => {
        if (!isNull(vDomNode._onUnmountHook))
            vDomNode._onUnmountHook();

        for (let i = 0; i < vDomNode._atoms.length; i++) {
            vDomNode._atoms[i]._remove();
        }

        _childVDomNode.unmount();
    };

    vDomNode.type = 'component';

    return vDomNode;
};

exports.onMount = function(hook) { // gets called after mounting.
    CURRENT_INITIALIZING_COMPONENT._onMountHook = hook;
};

exports.onUnmount = function(hook) { // gets called before unmounting.
    CURRENT_INITIALIZING_COMPONENT._onUnmountHook = hook;
};

exports.useAtom = function(valueArg, deps) {
    const atom = exports.atom(valueArg, deps);
    CURRENT_INITIALIZING_COMPONENT._atoms.push(atom);

    return atom;
};

exports.createRoot = function(anchor) {
    let _rootVDomNode = null;

    return {
        render: (target) => {
            if (!isNull(_rootVDomNode)) {
                _rootVDomNode.unmount();
            }
            _rootVDomNode = target;

            if (!isNull(_rootVDomNode)) {
                _rootVDomNode.create();
                _rootVDomNode.mount(anchor);
            }
        }
    };
};

return exports;
}());

