
const fm = (function(){
const util = {
    isUdf: (a) => typeof a === 'undefined',
    removeItem: (a, item) => {
        let i = a.indexOf(item);
        if (i < 0 || i >= a.length) return;

        const stop = a.length - 1;
        while (i < stop) {
            a[i] = a[++i];
        }
        a.pop();
    }
};

let ATOM_UPDATE_SCHEDULED = false;
const ATOM_STACK = [];

const UPDATE_ATOMS = () => {
    // 1. Call _update() on all dirty atoms.
    for (let i = 0; i < ATOM_STACK.length; i++) {
        const atom = ATOM_STACK[i];

        if (atom._isSource) {
            if (atom._dirty === true)
                atom._update();
        }
        else {
            for (let i = 0; i < atom._deps.length; i++) {
                if (atom._deps[i]._dirty === true) {
                    atom._update();
                    break;
                }
            }
        }
    }

    // 2. Set all atoms to not dirty.
    for (let i = 0; i < ATOM_STACK.length; i++) {
        const atom = ATOM_STACK[i];
        atom._dirty = false;
    }
};

const SCHEDULE_ATOM_UPDATE = () => {
    if (!ATOM_UPDATE_SCHEDULED) {
        ATOM_UPDATE_SCHEDULED = true;

        setTimeout(() => {
            ATOM_UPDATE_SCHEDULED = false;
            UPDATE_ATOMS(); // side effects in callbacks will schedule another update.
        });
    }
};

const exports = {};

let ATOM_ID_COUNTER = 0;

/*
value: initial value of atom or a function if deps is an Array.
deps: must be undefined, null, or a non-empty Array.
passDepsInArray: if true, dependency values will be passed to derivation function as an array.
*/
class Atom {
    constructor(value, deps, passDepsInArray) {
        this._deps = util.isUdf(deps) ? null : deps; // default value if caller does not pass argument.
        this._isSource = this._deps === null;
        this._passDepsInArray = passDepsInArray === true;

        this._type = 'atom';
        this._id = ATOM_ID_COUNTER++;

        this._active = false;
        this._dirty = false;
        this._callbacks = [];

        if (this._isSource) {
            this._value = value;

            this.update = (newValue) => {
                this._value = newValue;
                this._dirty = true;
                SCHEDULE_ATOM_UPDATE();
            };
        }
        else {
            // this._deps should be a non-empty array
            this._derivationFunc = value;
        }

        this.activate();
    }
    _callCallbacks() {
        for (let i = 0; i < this._callbacks.length; i++)
            this._callbacks[i](this._value);
    }
    _updateDerivedValue() {
        const values = Array(this._deps.length);
        for (let i = 0; i < this._deps.length; i++)
            values[i] = this._deps[i].value();

        this._value = this._passDepsInArray ?
            this._derivationFunc(values) : this._derivationFunc(...values);
    }
    _update () {
        if (!this._isSource) {
            this._updateDerivedValue();
            this._dirty = true;
        }
        this._callCallbacks();
    }
    value() {
        return this._value;
    }
    listen(newCallback) {
        this._callbacks.push(newCallback);
        return () => {
            util.removeItem(this._callbacks, newCallback);
        };
    }
    activate() {
        if (!this._active) {
            ATOM_STACK.push(this);
            if (!this._isSource)
                this._updateDerivedValue();
            this._active = true;
        }
    }
    deactivate() {
        if (this._active) {
            util.removeItem(ATOM_STACK, this);
            this._active = false;
        }
    }
};
exports.createAtom = (a, b, c) => new Atom(a, b, c);

const startsWith_on = (s) => s[0] === 'o' && s[1] === 'n';

class ElementNode {
    constructor(tagName, props, children) {
        this._tagName = tagName;
        this._props = props;
        this._propKeys = this._props === null ? null : Object.keys(this._props);
        this._children = children;

        // _mounted and _mountedDOM = both false, both true, false + true, but never true + false.
        this._mounted = false;
        this._mountedDOM = false;

        this._disposeCallbacks = [];
        
        this.type = 'element';
    }
    create(parentVDomNode, anchor) {
        this._parentVDomNode = parentVDomNode;
        this._anchor = anchor;

        this._domElement = document.createElement(this._tagName);

        if (this._children !== null) {
            for (let i = 0; i < this._children.length; i++)
                this._children[i].create(this, this._domElement);
        }
    }
    mount(insertMountFlag, remountFlag) {
        if (!this._mountedDOM || remountFlag) {
            if (insertMountFlag) {
                const after = this._parentVDomNode.getNodeAfter(this);
                this._anchor.insertBefore(this._domElement, after);
            }
            else {
                this._anchor.appendChild(this._domElement);
            }
            this._mountedDOM = true;
        }

        if (!this._mounted) {
            if (this._props !== null) {
                for (let i = 0; i < this._propKeys.length; i++) {
                    const attrib = this._propKeys[i];
                    const prop = this._props[attrib];

                    if (prop._type === 'atom') { // if a dynamic attribute.
                        this._domElement.setAttribute(attrib, prop.value());
                        this._disposeCallbacks.push(prop.listen((newValue) => {
                            this._domElement.setAttribute(attrib, newValue);
                        }));
                    }
                    else if (startsWith_on(attrib)) { // if an event listener attribute.
                        const type = attrib.slice(2).toLowerCase();
                        this._domElement.addEventListener(type, prop);
                    }
                    else { // if a static attribute.
                        this._domElement.setAttribute(attrib, prop);
                    }
                }
            }

            if (this._children !== null) {
                for (let i = 0; i < this._children.length; i++)
                    this._children[i].mount(false, false);
            }

            this._mounted = true;
        }
    }
    unmount(unmountDOMFlag) {
        if (this._mounted) {
            if (this._children !== null) {
                for (let i = 0; i < this._children.length; i++)
                    this._children[i].unmount();
            }

            for (let i = 0; i < this._disposeCallbacks.length; i++)
                this._disposeCallbacks[i]();
            this._disposeCallbacks = [];

            this._mounted = false;
        }

        if (this._mountedDOM && unmountDOMFlag) {
            this._anchor.removeChild(this._domElement);
            this._mountedDOM = false;
        }
    }
    getNodeAfter(childVDomNode) {
        const index = this._children.indexOf(childVDomNode);

        for (let i = index+1; i < this._children.length; i++) {
            const e = this._children[i].getFirstElement();
            if (e !== null) return e;
        }
        return null;
    }
    getFirstElement() {
        return this._domElement;
    }
};

exports.createElement = (a, b, c) => new ElementNode(a, b, c);

class TextNode {
    constructor(text) {
        this._text = text;

        // _mounted and _mountedDOM behave same as in createElement().
        this._mounted = false;
        this._mountedDOM = false;

        this._dispose = null;

        this.type = 'text';
    }
    create(parentVDomNode, anchor) {
        this._parentVDomNode = parentVDomNode;
        this._anchor = anchor;

        const value = this._text._type === 'atom' ? '' : this._text;
        this._domTextNode = document.createTextNode(value);
    }
    mount(insertMountFlag, remountFlag) {
        if (!this._mounted || remountFlag) {
            if (this._text._type === 'atom') {
                this._domTextNode.nodeValue = this._text.value();
                this._dispose = this._text.listen((newValue) => {
                    this._domTextNode.nodeValue = newValue;
                });
            }
            this._mounted = true;
        }

        if (!this._mountedDOM) {
            if (insertMountFlag) {
                const after = this._parentVDomNode.getNodeAfter(this);
                this._anchor.insertBefore(this._domTextNode, after);
            }
            else {
                this._anchor.appendChild(this._domTextNode);
            }
            this._mountedDOM = true;
        }
    }
    unmount(unmountDOMFlag) {
        if (this._mountedDOM && unmountDOMFlag) {
            this._anchor.removeChild(this._domTextNode);
            this._mountedDOM = false;
        }

        if (this._mounted) {
            if (this._dispose !== null) {
                this._dispose();
                this._dispose = null;
            }
            this._mounted = false;
        }
    }
    getFirstElement() {
        return this._domTextNode;
    }
};
exports.createText = (a) => new TextNode(a);

let CURRENT_INITIALIZING_COMPONENT = null;

class Component {
    constructor(initFunc, props) {
        if (util.isUdf(props)) props = null;
        
        this._atoms = [];
        this._onMountHooks = [];
        this._onUnmountHooks = [];

        CURRENT_INITIALIZING_COMPONENT = this;
        this._childVDomNode = initFunc(props);
        CURRENT_INITIALIZING_COMPONENT = null;

        this.type = 'component';
    }
    create(parentVDomNode, anchor) {
        this._parentVDomNode = parentVDomNode;
        this._childVDomNode.create(this, anchor);
    }
    mount(insertMountFlag, remountFlag) {
        for (let i = 0; i < this._atoms.length; i++)
            this._atoms[i].activate();

        this._childVDomNode.mount(insertMountFlag, remountFlag);

        for (let i = 0; i < this._onMountHooks.length; i++)
            this._onMountHooks[i]();
    }
    unmount(unmountDOMFlag) {
        for (let i = 0; i < this._onUnmountHooks.length; i++)
            this._onUnmountHooks[i]();

        this._childVDomNode.unmount(unmountDOMFlag);

        for (let i = 0; i < this._atoms.length; i++)
            this._atoms[i].deactivate();
    }
    getNodeAfter(childVDomNode) {
        this._parentVDomNode.getNodeAfter(this);
    }
    getFirstElement() {
        this._childVDomNode.getFirstElement();
    }
};
exports.createComponent = (a, b) => new Component(a, b);

// onMount hooks gets called after mounting.
exports.onMount = function(hook) {
    CURRENT_INITIALIZING_COMPONENT._onMountHooks.push(hook);
};

// onUnmount hooks gets called before unmounting.
exports.onUnmount = function(hook) {
    CURRENT_INITIALIZING_COMPONENT._onUnmountHooks.push(hook);
};

exports.useAtom = function(a, b, c) {
    const atom = new Atom(a, b, c);
    CURRENT_INITIALIZING_COMPONENT._atoms.push(atom);
    return atom;
};

class Fragment {
    constructor(children) {
        this._children = children;
        this.type = 'fragment';
    }
    create(parentVDomNode, anchor) {
        this._parentVDomNode = parentVDomNode;
        for (let i = 0; i < this._children.length; i++)
            this._children[i].create(this, anchor);
    }
    mount(insertMountFlag, remountFlag) {
        for (let i = 0; i < this._children.length; i++)
            this._children[i].mount(insertMountFlag, remountFlag);
    }
    unmount(unmountDOMFlag) {
        for (let i = 0; i < this._children.length; i++)
            this._children[i].unmount(unmountDOMFlag);
    }
    getNodeAfter(childVDomNode) {
        const index = this._children.indexOf(childVDomNode);

        for (let i = index+1; i < this._children.length; i++) {
            const e = this._children[i].getFirstElement();
            if (e !== null) return e;
        }
        return this._parentVDomNode.getNodeAfter(this);
    }
    getFirstElement() {
        for (let i = 0; i < this._children.length; i++) {
            const e = this._children[i].getFirstElement();
            if (e !== null) return e;
        }
        return null;
    }
};
exports.createFragment = (a) => new Fragment(a);

class IfNode {
    constructor(conditions, children) {
        this._children = children;

        this._activeConditionIndex = -1;
        this._isCreated = Array(conditions.length).fill(false);
        this._atom = exports.createAtom((arr) => arr, conditions, true);

        this.type = 'if';
    }
    _activateCondition(newIndex, insertMountFlag, remountFlag) {
        const prevIndex = this._activeConditionIndex;
        const indexChanged = prevIndex !== newIndex;

        if (prevIndex !== -1 && indexChanged)
            this._children[prevIndex].unmount(true); // physically unmount

        if (newIndex !== -1 && (indexChanged || remountFlag)) {
            if (!this._isCreated[newIndex]) {
                this._children[newIndex].create(this, this._anchor);
                this._isCreated[newIndex] = true;
            }
            this._children[newIndex].mount(insertMountFlag, remountFlag);
        }

        this._activeConditionIndex = newIndex;
    }
    create(parentVDomNode, anchor) {
        this._parentVDomNode = parentVDomNode;
        this._anchor = anchor;
    }
    mount(insertMountFlag, remountFlag) {
        this._atom.activate();
        this._dispose = this._atom.listen((conditions) => {
            this._activateCondition(conditions.indexOf(true), true, false);
        });

        this._activateCondition(this._atom.value().indexOf(true), insertMountFlag, true);
    }
    unmount(unmountDOMFlag) {
        if (this._activeConditionIndex !== -1)
            this._children[this._activeConditionIndex].unmount(unmountDOMFlag);

        this._dispose();
        this._dispose = null;
        this._atom.deactivate();
    }
    getNodeAfter(childVDomNode) {
        return this._parentVDomNode.getNodeAfter(this);
    }
    getFirstElement() {
        return this._activeConditionIndex === -1 ? null :
            this._children[this._activeConditionIndex].getFirstElement();
    }
};
exports.createIf = (a, b) => new IfNode(a, b);

class ForNode {
    constructor(component, atom) {
        this._component = component;
        this._atom = atom;

        this._atomIDs = Object.create(null);
        this._items = [];
        this._childVDomNodes = [];
        this._mountingChildren = false;

        this.type = 'for';
    }
    _reconcileElements(newItems, insertMountFlag, remountFlag) {
        const oldAtomIDs = this._atomIDs;
        const oldItems = this._items;
        const oldChildVDomNodes = this._childVDomNodes;

        // Remove duplicates in newItems.
        const newAtomIDs = Object.create(null);
        const temp = [];
        for (let i = 0; i < newItems.length; i++) {
            const item = newItems[i];

            if (!util.isUdf(item) && item !== null && !(item._id in newAtomIDs)) {
                newAtomIDs[item._id] = i;
                temp.push(item);
            }
        }
        newItems = temp;

        const newChildVDomNodes = Array(newItems.length);

        for (let i = 0; i < oldItems.length; i++) {
            const oldItem = oldItems[i];

            if (oldItem._id in newAtomIDs) {
                // Swap vDOM node.
                newChildVDomNodes[newAtomIDs[oldItem._id]] = oldChildVDomNodes[i];
            }
            else {
                // When item is removed, unmount old vDOM node.
                oldChildVDomNodes[i].unmount(true);
            }
        }

        // Create vDOM nodes for newly added items.
        for (let i = 0; i < newItems.length; i++) {
            const newItem = newItems[i];

            if (!(newItem._id in oldAtomIDs)) {
                const child = exports.createComponent(this._component, newItem);
                child.create(this, this._anchor);
                newChildVDomNodes[i] = child;
            }
        }

        const swappedIndexes = Object.create(null);

        this._items = [...newItems];
        this._atomIDs = newAtomIDs;
        this._childVDomNodes = [];

        this._mountingChildren = true;
        // Remount vDOM nodes for all existing and newly added items.
        for (let i = 0; i < newChildVDomNodes.length; i++) {
            const remountChild = i in swappedIndexes ? true : remountFlag;

            this._childVDomNodes.push(newChildVDomNodes[i]);
            this._childVDomNodes[i].mount(insertMountFlag, remountFlag);
        }
        this._mountingChildren = false;
    }
    create(parentVDomNode, anchor) {
        this._parentVDomNode = parentVDomNode;
        this._anchor = anchor;
    }
    mount(insertMountFlag, remountFlag) {
        this._atom.activate();
        this._dispose = this._atom.listen((items) => {
            this._reconcileElements(items, true, true/*change this to false later on*/);
        });

        this._reconcileElements(this._atom.value(), insertMountFlag, remountFlag);
    }
    unmount(unmountDOMFlag) {
        for (let i = 0; i < this._childVDomNodes.length; i++) {
            const child = this._childVDomNodes[i];
            child.unmount(unmountDOMFlag);
        }

        this._dispose();
        this._dispose = null;
        this._atom.deactivate();
    }
    getNodeAfter(childVDomNode) {
        const index = this._childVDomNodes.indexOf(childVDomNode);

        for (let i = index+1; i < this._childVDomNodes.length; i++) {
            const e = this._childVDomNodes[i].getFirstElement();
            if (e !== null) return e;
        }
        return this._parentVDomNode.getNodeAfter(this);
    }
    getFirstElement() {
        for (let i = 0; i < this._childVDomNodes.length; i++) {
            const e = this._childVDomNodes[i].getFirstElement();
            if (e !== null) return e;
        }
        return null;
    }
};
exports.createFor = (a, b) => new ForNode(a, b);

class RootNode {
    constructor(anchor) {
        this._anchor = anchor;
        this._node = null;
    }
    render(target) {
        if (util.isUdf(target)) target = null;

        if (this._node !== null)
            this._node.unmount(true); // physically unmount
        this._node = target;

        if (this._node !== null) {
            if (this._node.isCreated !== true) {
                this._node.create(this, this._anchor);
                this._node.isCreated = true;
            }
            this._node.mount(false, false);
        }
    }
    getNodeAfter(childVDomNode) {
        return null;
    }
};
exports.createRoot = (a) => new RootNode(a);

return exports;
}());
