/* global Promise */
var utils = require('../utils/');
var component = require('../core/component');
var THREE = require('../lib/three');
var shader = require('../core/shader');

var error = utils.debug('components:material:error');
var registerComponent = component.registerComponent;
var shaders = shader.shaders;
var shaderNames = shader.shaderNames;

/**
 * Material component.
 *
 * @member {object} shader - Determines how material is shaded. Defaults to `standard`,
 *         three.js's implementation of PBR. Another standard shading model is `flat` which
 *         uses MeshBasicMaterial.
 */
module.exports.Component = registerComponent('material', {
  schema: {
    shader: { default: 'standard', oneOf: shaderNames },
    transparent: { default: false },
    opacity: { default: 1.0, min: 0.0, max: 1.0 },
    side: { default: 'front', oneOf: ['front', 'back', 'double'] },
    depthTest: { default: true }
  },

  init: function () {
    this.material = null;
  },

  /**
   * Update or create material.
   *
   * @param {object|null} oldData
   */
  update: function (oldData) {
    var data = this.data;
    if (!this.shader || data.shader !== oldData.shader) {
      this.updateShader(data.shader);
    }
    this.shader.update(this.data);
    this.updateMaterial();
  },

  updateSchema: function (data) {
    var newShader = data.shader;
    var currentShader = this.data && this.data.shader;
    var shader = newShader || currentShader;
    var schema = shaders[shader] && shaders[shader].schema;
    if (!schema) { error('Unknown shader schema ' + shader); }
    if (currentShader && newShader === currentShader) { return; }
    this.extendSchema(schema);
    this.updateBehavior();
  },

  updateBehavior: function () {
    var scene = this.el.sceneEl;
    var schema = this.schema;
    var self = this;
    var tickProperties = {};
    var tick = function (time, delta) {
      var keys = Object.keys(tickProperties);
      keys.forEach(update);
      function update (key) { tickProperties[key] = time; }
      self.shader.update(tickProperties);
    };
    var keys = Object.keys(schema);
    keys.forEach(function (key) {
      if (schema[key].type === 'time') {
        self.tick = tick;
        tickProperties[key] = true;
        scene.addBehavior(self);
      }
    });
    if (Object.keys(tickProperties).length === 0) {
      scene.removeBehavior(this);
    }
  },

  updateShader: function (shaderName) {
    var data = this.data;
    var Shader = shaders[shaderName] && shaders[shaderName].Shader;
    var material;
    if (!Shader) { throw new Error('Unknown shader ' + shaderName); }
    this.shader = new Shader();
    this.shader.el = this.el;
    material = this.shader.init(data);
    this.setMaterial(material);
    this.updateSchema(data);
  },

  updateMaterial: function () {
    var data = this.data;
    var material = this.material;
    material.side = parseSide(data.side);
    material.opacity = data.opacity;
    material.transparent = data.transparent !== false || data.opacity < 1.0;
    material.depthTest = data.depthTest !== false;
  },

  /**
   * Remove material on remove (callback).
   * Dispose of it from memory and unsubscribe from scene updates.
   */
  remove: function () {
    var defaultMaterial = new THREE.MeshBasicMaterial();
    var material = this.material;
    var object3D = this.el.getObject3D('mesh');
    if (object3D) { object3D.material = defaultMaterial; }
    disposeMaterial(material, this.system);
  },

  /**
   * (Re)create new material. Has side-effects of setting `this.material` and updating
   * material registration in scene.
   *
   * @param {object} data - Material component data.
   * @param {object} type - Material type to create.
   * @returns {object} Material.
   */
  setMaterial: function (material) {
    var mesh = this.el.getOrCreateObject3D('mesh', THREE.Mesh);
    var system = this.system;
    if (this.material) { disposeMaterial(this.material, system); }
    this.material = mesh.material = material;
    system.registerMaterial(material);
  }
});

/**
 * Returns a three.js constant determining which material face sides to render
 * based on the side parameter (passed as a component property).
 *
 * @param {string} [side=front] - `front`, `back`, or `double`.
 * @returns {number} THREE.FrontSide, THREE.BackSide, or THREE.DoubleSide.
 */
function parseSide (side) {
  switch (side) {
    case 'back': {
      return THREE.BackSide;
    }
    case 'double': {
      return THREE.DoubleSide;
    }
    default: {
      // Including case `front`.
      return THREE.FrontSide;
    }
  }
}

/**
 * Dispose of material from memory and unsubscribe material from scene updates like fog.
 */
function disposeMaterial (material, system) {
  material.dispose();
  system.unregisterMaterial(material);
}
