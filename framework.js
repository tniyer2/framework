
const fm = (function(){
const util = {
    isUdf: (a) => typeof a === 'undefined',
    removeIndex: (a, i) => {
        if (i === -1) return;

        const stop = a.length - 1;
        while (i < stop) {
            a[i] = a[++i];
        }
        a.pop();
    },
    bisectLeft: (arr, e) => {
        let low = 0;
        let high = arr.length;
        let mid;

        while (low < high) {
            mid = Math.floor((low + high) / 2);
            if (arr[mid] < e)
                low = mid + 1;
            else
                high = mid;
        }
        return low;
    }
};

let ATOM_ID_COUNTER = 0;

let ATOM_UPDATE_SCHEDULED = false;
let ATOM_CLEAN_SCHEDULED = false;

let ATOM_DELETE_COUNTER = 0;
let ATOM_IDS_TO_DELETE = Object.create(null);

const ATOM_STACK = [];

const CLEAN_ATOMS = () => {
    if (ATOM_DELETE_COUNTER > 0) {
        let deleteCount = 0;

        for (let i = 0; i < ATOM_STACK.length; i++) {
            const atom = ATOM_STACK[i];

            if (atom._id in ATOM_IDS_TO_DELETE)
                deleteCount++;
            else if (deleteCount > 0)
                ATOM_STACK[i - deleteCount] = atom;
        }

        ATOM_STACK.splice(ATOM_STACK.length - deleteCount, deleteCount);

        ATOM_DELETE_COUNTER = 0;
        ATOM_IDS_TO_DELETE = Object.create(null);
    }
};

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

const SCHEDULE_ATOM_CLEAN = () => {
    if (!ATOM_CLEAN_SCHEDULED) {
        ATOM_CLEAN_SCHEDULED = true;

        setTimeout(() => {
            CLEAN_ATOMS();
            ATOM_CLEAN_SCHEDULED = false;
        });
    }
};

const SCHEDULE_ATOM_UPDATE = () => {
    if (!ATOM_UPDATE_SCHEDULED) {
        ATOM_UPDATE_SCHEDULED = true;

        setTimeout(() => {
            CLEAN_ATOMS();

            ATOM_UPDATE_SCHEDULED = false;
            UPDATE_ATOMS(); // side effects in callbacks will schedule another update.
        });
    }
};

const exports = {};

/*
value: initial value of atom or a function if deps is an Array.
deps: must be undefined, null, or a non-empty Array.
passDepsInArray: if true, dependency values will be passed to derivation function as an array.
*/
function Atom(value, deps, passDepsInArray) {
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
Atom.prototype._callCallbacks = function() {
    for (let i = 0; i < this._callbacks.length; i++)
        this._callbacks[i](this._value);
};
Atom.prototype._updateDerivedValue = function() {
    const values = Array(this._deps.length);
    for (let i = 0; i < this._deps.length; i++)
        values[i] = this._deps[i].value();

    this._value = this._passDepsInArray ?
        this._derivationFunc(values) : this._derivationFunc(...values);
};
Atom.prototype._update = function() {
    if (!this._isSource) {
        this._updateDerivedValue();
        this._dirty = true;
    }
    this._callCallbacks();
};
Atom.prototype.value = function() {
    return this._value;
};
Atom.prototype.listen = function(newCallback) {
    this._callbacks.push(newCallback);
    return this._callbacks.length-1;
};
Atom.prototype.unsubscribe = function(index) {
    const l = this._callbacks.length;
    if (l === 1 || index >= l-1)
        this._callbacks.pop();
    else
        this._callbacks[index] = this._callbacks.pop();
}
Atom.prototype.activate = function() {
    if (!this._active) {
        ATOM_STACK.push(this);

        if (!this._isSource)
            this._updateDerivedValue();

        this._active = true;
    }
};
Atom.prototype.deactivate = function() {
    if (this._active) {
        ATOM_DELETE_COUNTER++;
        ATOM_IDS_TO_DELETE[this._id] = true;
        SCHEDULE_ATOM_CLEAN();

        this._active = false;
    }
};
exports.createAtom = (a, b, c) => new Atom(a, b, c);


const startsWith_on = (s) => s[0] === 'o' && s[1] === 'n';

function ElementNode (tagName, props, children) {
    this._tagName = tagName;
    this._props = props;
    this._propKeys = this._props === null ? null : Object.keys(this._props);
    this._children = children;

    // _mounted and _mountedDOM = both false, both true, false + true, but never true + false.
    this._mounted = false;
    this._mountedDOM = false;

    this._disposeIndexes = null;
    
    this.type = 'element';
};
ElementNode.prototype.create = function(parentVDomNode, anchor) {
    this._parentVDomNode = parentVDomNode;
    this._anchor = anchor;

    this._domElement = document.createElement(this._tagName);

    if (this._children !== null) {
        for (let i = 0; i < this._children.length; i++)
            this._children[i].create(this, this._domElement);
    }
};
ElementNode.prototype.mount = function(insertMountFlag, remountFlag) {
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

                    if (this._disposeIndexes === null)
                        this._disposeIndexes = [];

                    this._disposeIndexes.push(prop.listen((newValue) => {
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
};
ElementNode.prototype.unmount = function(unmountDOMFlag) {
    if (this._mounted) {
        if (this._children !== null) {
            for (let i = 0; i < this._children.length; i++)
                this._children[i].unmount();
        }

        if (this._props !== null) {
            for (let i = 0; i < this._propKeys.length; i++) {
                const prop = this._props[this._propKeys[i]];

                let j = 0;
                if (prop._type === 'atom')
                    prop.unsubscribe(this._disposeIndexes[j++]);
            }
            this._disposeIndexes = null;
        }

        this._mounted = false;
    }

    if (this._mountedDOM && unmountDOMFlag) {
        this._anchor.removeChild(this._domElement);
        this._mountedDOM = false;
    }
};
ElementNode.prototype.getNodeAfter = function(childVDomNode) {
    const index = this._children.indexOf(childVDomNode);

    for (let i = index+1; i < this._children.length; i++) {
        const e = this._children[i].getFirstElement();
        if (e !== null) return e;
    }
    return null;
};
ElementNode.prototype.getFirstElement = function() {
    return this._domElement;
};
exports.createElement = (a, b, c) => new ElementNode(a, b, c);


function TextNode(text) {
    this._text = text;

    // _mounted and _mountedDOM behave same as in createElement().
    this._mounted = false;
    this._mountedDOM = false;

    this._disposeIndex = null;

    this.type = 'text';
};
TextNode.prototype.create = function(parentVDomNode, anchor) {
    this._parentVDomNode = parentVDomNode;
    this._anchor = anchor;

    const value = this._text._type === 'atom' ? '' : this._text;
    this._domTextNode = document.createTextNode(value);
};
TextNode.prototype.mount = function(insertMountFlag, remountFlag) {
    if (!this._mounted) {
        if (this._text._type === 'atom') {
            this._domTextNode.nodeValue = this._text.value();
            this._disposeIndex = this._text.listen((newValue) => {
                this._domTextNode.nodeValue = newValue;
            });
        }
        this._mounted = true;
    }

    if (!this._mountedDOM || remountFlag) {
        if (insertMountFlag) {
            const after = this._parentVDomNode.getNodeAfter(this);
            this._anchor.insertBefore(this._domTextNode, after);
        }
        else {
            this._anchor.appendChild(this._domTextNode);
        }
        this._mountedDOM = true;
    }
};
TextNode.prototype.unmount = function(unmountDOMFlag) {
    if (this._mountedDOM && unmountDOMFlag) {
        this._anchor.removeChild(this._domTextNode);
        this._mountedDOM = false;
    }

    if (this._mounted) {
        if (this._disposeIndex !== null) {
            this._text.unsubscribe(this._disposeIndex);
            this._disposeIndex = null;
        }
        this._mounted = false;
    }
};
TextNode.prototype.getFirstElement = function() {
    return this._domTextNode;
};
exports.createText = (a) => new TextNode(a);


let COMPONENT = null; // current initializaing component

function Component(initFunc, props) {
    if (util.isUdf(props)) props = null;
    
    this._atoms = null;
    this._onMountHooks = null;
    this._onUnmountHooks = null;

    COMPONENT = this;
    this._childVDomNode = initFunc(props);
    COMPONENT = null;

    this.type = 'component';
};
Component.prototype.create = function(parentVDomNode, anchor) {
    this._parentVDomNode = parentVDomNode;
    this._childVDomNode.create(this, anchor);
};
Component.prototype.mount = function(insertMountFlag, remountFlag) {
    if (this._atoms !== null) {
        for (let i = 0; i < this._atoms.length; i++)
            this._atoms[i].activate();
    }

    this._childVDomNode.mount(insertMountFlag, remountFlag);

    if (this._onMountHooks !== null) {
        for (let i = 0; i < this._onMountHooks.length; i++)
            this._onMountHooks[i]();
    }
};
Component.prototype.unmount = function(unmountDOMFlag) {
    if (this._onUnmountHooks !== null) {
        for (let i = 0; i < this._onUnmountHooks.length; i++)
            this._onUnmountHooks[i]();
    }

    this._childVDomNode.unmount(unmountDOMFlag);

    if (this._atoms !== null) {
        for (let i = 0; i < this._atoms.length; i++)
            this._atoms[i].deactivate();
    }
};
Component.prototype.getNodeAfter = function(_/*childVDomNode*/) {
    return this._parentVDomNode.getNodeAfter(this);
};
Component.prototype.getFirstElement = function() {
    return this._childVDomNode.getFirstElement();
};
exports.createComponent = (a, b) => new Component(a, b);


// onMount hooks gets called after mounting.
exports.onMount = function(hook) {
    if (COMPONENT._onMountHooks === null)
        COMPONENT._onMountHooks = [hook];
    else
        COMPONENT._onMountHooks.push(hook);
};

// onUnmount hooks gets called before unmounting.
exports.onUnmount = function(hook) {
    if (COMPONENT._onUnmountHooks === null)
        COMPONENT._onUnmountHooks = [hook];
    else
        COMPONENT._onUnmountHooks.push(hook);
};

exports.useAtom = function(a, b, c) {
    const atom = new Atom(a, b, c);
    if (COMPONENT._atoms === null)
        COMPONENT._atoms = [atom];
    else
        COMPONENT._atoms.push(atom);
    return atom;
};


function Fragment(children) {
    this._children = children;
    this.type = 'fragment';
};
Fragment.prototype.create = function(parentVDomNode, anchor) {
    this._parentVDomNode = parentVDomNode;
    for (let i = 0; i < this._children.length; i++)
        this._children[i].create(this, anchor);
};
Fragment.prototype.mount = function(insertMountFlag, remountFlag) {
    for (let i = 0; i < this._children.length; i++)
        this._children[i].mount(insertMountFlag, remountFlag);
};
Fragment.prototype.unmount = function(unmountDOMFlag) {
    for (let i = 0; i < this._children.length; i++)
        this._children[i].unmount(unmountDOMFlag);
};
Fragment.prototype.getNodeAfter = function(childVDomNode) {
    const index = this._children.indexOf(childVDomNode);

    for (let i = index+1; i < this._children.length; i++) {
        const e = this._children[i].getFirstElement();
        if (e !== null) return e;
    }
    return this._parentVDomNode.getNodeAfter(this);
};
Fragment.prototype.getFirstElement = function() {
    for (let i = 0; i < this._children.length; i++) {
        const e = this._children[i].getFirstElement();
        if (e !== null) return e;
    }
    return null;
};
exports.createFragment = (a) => new Fragment(a);


function IfNode(conditions, children) {
    this._children = children;

    this._activeConditionIndex = -1;
    this._isCreated = Array(conditions.length).fill(false);
    this._atom = exports.createAtom((arr) => arr, conditions, true);

    this.type = 'if';
};
IfNode.prototype._activateCondition = function(newIndex, insertMountFlag, remountFlag) {
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
};
IfNode.prototype.create = function(parentVDomNode, anchor) {
    this._parentVDomNode = parentVDomNode;
    this._anchor = anchor;
};
IfNode.prototype.mount = function(insertMountFlag, _/*remountFlag*/) {
    this._atom.activate();
    this._disposeIndex = this._atom.listen((conditions) => {
        this._activateCondition(conditions.indexOf(true), true, false);
    });

    this._activateCondition(this._atom.value().indexOf(true), insertMountFlag, true);
};
IfNode.prototype.unmount = function(unmountDOMFlag) {
    if (this._activeConditionIndex !== -1)
        this._children[this._activeConditionIndex].unmount(unmountDOMFlag);

    this._atom.unsubscribe(this._disposeIndex);
    this._disposeIndex = null;
    this._atom.deactivate();
};
IfNode.prototype.getNodeAfter = function(_/*childVDomNode*/) {
    return this._parentVDomNode.getNodeAfter(this);
};
IfNode.prototype.getFirstElement = function() {
    return this._activeConditionIndex === -1 ? null :
        this._children[this._activeConditionIndex].getFirstElement();
};
exports.createIf = (a, b) => new IfNode(a, b);


function ForNode(component, atom) {
    this._component = component;
    this._atom = atom;

    this._atomIDs = Object.create(null);
    this._items = [];
    this._childVDomNodes = [];
    this._mountingChildren = false;

    this.type = 'for';
};
ForNode.prototype._calcSwappedIndexes = function(unchangedIndexes) {
    const seq = []; // longest increasing sequence.
    const seqIndex = []; // indexes of longest increasing sequence.
    const path = Array(unchangedIndexes.length).fill(-1);

    for (let i = 0; i < unchangedIndexes.length; i++) {
        const order = unchangedIndexes[i];
        if (util.isUdf(order)) continue;

        if (seq.length === 0 || seq[seq.length-1] < order) {
            path[i] = seqIndex.length === 0 ? -1 : seqIndex[seqIndex.length-1];
            seq.push(order);
            seqIndex.push(i);
        }
        else {
            const j = util.bisectLeft(seq, order);
            path[i] = j === 0 ? -1 : seqIndex[j-1];
            seq[j] = order;
            seqIndex[j] = i;
        }
    }

    const swapped = Object.create(null);
    let i = seqIndex[seqIndex.length-1];
    while (i >= 0) {
        swapped[i] = false; // if in longest seqeunce index is unchanged.
        i = path[i];
    }

    for (let i = 0; i < unchangedIndexes.length; i++) {
        if (!util.isUdf(unchangedIndexes[i]) && !(i in swapped))
            swapped[i] = true; // if not in longest sequence index is swapped.
    }

    return swapped;
};
ForNode.prototype._reconcileElements = function(newItems, insertMountFlag, remountFlag) {
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
    const unchangedIndexes = Array(newItems.length);
    let orderCounter = 0;

    for (let i = 0; i < oldItems.length; i++) {
        const oldItem = oldItems[i];

        if (oldItem._id in newAtomIDs) {
            // Unchanged vDOM node.
            const newIndex = newAtomIDs[oldItem._id];
            unchangedIndexes[newIndex] = orderCounter++;
            newChildVDomNodes[newIndex] = oldChildVDomNodes[i];
        }
        else {
            // When item is removed, unmount old vDOM node.
            oldChildVDomNodes[i].unmount(true);
        }
    }

    // Create vDOM nodes for newly added items.
    const addedIndexes = Object.create(null);
    for (let i = 0; i < newItems.length; i++) {
        const newItem = newItems[i];

        if (!(newItem._id in oldAtomIDs)) {
            addedIndexes[i] = true;
            const child = exports.createComponent(this._component, newItem);
            child.create(this, this._anchor);
            newChildVDomNodes[i] = child;
        }
    }

    this._items = [...newItems];
    this._atomIDs = newAtomIDs;

    if (remountFlag) {
        this._childVDomNodes = [];
        for (let i = 0; i < newChildVDomNodes.length; i++) {
            const child = newChildVDomNodes[i];
            this._childVDomNodes.push(child); // this line must come before mount is called.
            child.mount(insertMountFlag, true);
        }
    }
    else {
        this._mountingChildren = true;

        this._swappedIndexes = this._calcSwappedIndexes(unchangedIndexes);

        this._childVDomNodes = newChildVDomNodes;
        for (let i = this._childVDomNodes.length-1; i >= 0; i--) {
            this._childVDomNodes[i].mount(true, this._swappedIndexes[i] === true || i in addedIndexes);
        }

        this._mountingChildren = false;
    }
};
ForNode.prototype.create = function(parentVDomNode, anchor) {
    this._parentVDomNode = parentVDomNode;
    this._anchor = anchor;
};
ForNode.prototype.mount = function(insertMountFlag, remountFlag) {
    this._atom.activate();
    this._disposeIndex = this._atom.listen((items) => {
        this._reconcileElements(items, true, false);
    });

    this._reconcileElements(this._atom.value(), insertMountFlag, remountFlag);
};
ForNode.prototype.unmount = function(unmountDOMFlag) {
    for (let i = 0; i < this._childVDomNodes.length; i++) {
        const child = this._childVDomNodes[i];
        child.unmount(unmountDOMFlag);
    }

    this._atom.unsubscribe(this._disposeIndex);
    this._disposeIndex = null;
    this._atom.deactivate();
};
ForNode.prototype.getNodeAfter = function(childVDomNode) {
    const index = this._childVDomNodes.indexOf(childVDomNode);

    for (let i = index+1; i < this._childVDomNodes.length; i++) {
        const e = this._childVDomNodes[i].getFirstElement();
        if (e !== null) return e;
    }
    return this._parentVDomNode.getNodeAfter(this);
};
ForNode.prototype.getFirstElement = function() {
    if (this._mountingChildren)
        throw new Error('this._mountingChildren should be false.');

    for (let i = 0; i < this._childVDomNodes.length; i++) {
        const e = this._childVDomNodes[i].getFirstElement();
        if (e !== null) return e;
    }
    return null;
};
exports.createFor = (a, b) => new ForNode(a, b);


function RootNode(anchor) {
    this._anchor = anchor;
    this._node = null;
};
RootNode.prototype.render = function(target) {
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
};
RootNode.prototype.getNodeAfter = function(_/*childVDomNode*/) {
    return null;
};
exports.createRoot = (a) => new RootNode(a);

return exports;
}());
