/**
 * Backbone localStorage Adapter
 * Version 1.1.0
 *
 * https://github.com/jeromegn/Backbone.localStorage
 * 
 * replaced from localStorage to sessionStorage.
 */
(function (root, factory) {
   if (typeof define === "function" && define.amd) {
      // AMD. Register as an anonymous module.
      define(["underscore","backbone"], function(_, Backbone) {
        // Use global variables if the locals are undefined.
        return factory(_ || root._, Backbone || root.Backbone);
      });
   } else {
      // RequireJS isn't being used. Assume underscore and backbone are loaded in <script> tags
      factory(_, Backbone);
   }
}(this, function(_, Backbone) {
// A simple module to replace `Backbone.sync` with *sessionStorage*-based
// persistence. Models are given GUIDS, and saved into a JSON object. Simple
// as that.

// Hold reference to Underscore.js and Backbone.js in the closure in order
// to make things work even if they are removed from the global namespace

// Generate four random hex digits.
function S4() {
   return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
};

// Generate a pseudo-GUID by concatenating random hexadecimal.
function guid() {
   return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
};

// Our Store is represented by a single JS object in *sessionStorage*. Create it
// with a meaningful name, like the name you'd give a table.
// window.Store is deprectated, use Backbone.SessionStorage instead
Backbone.SessionStorage = window.Store = function(name) {
  this.name = name;
  var store = this.sessionStorage().getItem(this.name);
  this.records = (store && store.split(",")) || [];
};

_.extend(Backbone.SessionStorage.prototype, {

  // Save the current state of the **Store** to *sessionStorage*.
  save: function() {
    this.sessionStorage().setItem(this.name, this.records.join(","));
  },

  // Add a model, giving it a (hopefully)-unique GUID, if it doesn't already
  // have an id of it's own.
  create: function(model) {
    if (!model.id) {
      model.id = guid();
      model.set(model.idAttribute, model.id);
    }
    this.sessionStorage().setItem(this.name+"-"+model.id, JSON.stringify(model));
    this.records.push(model.id.toString());
    this.save();
    return this.find(model);
  },

  // Update a model by replacing its copy in `this.data`.
  update: function(model) {
    this.sessionStorage().setItem(this.name+"-"+model.id, JSON.stringify(model));
    if (!_.include(this.records, model.id.toString()))
      this.records.push(model.id.toString()); this.save();
    return this.find(model);
  },

  // Retrieve a model from `this.data` by id.
  find: function(model) {
    return this.jsonData(this.sessionStorage().getItem(this.name+"-"+model.id));
  },

  // Return the array of all models currently in storage.
  findAll: function() {
    return _(this.records).chain()
      .map(function(id){
        return this.jsonData(this.sessionStorage().getItem(this.name+"-"+id));
      }, this)
      .compact()
      .value();
  },

  // Delete a model from `this.data`, returning it.
  destroy: function(model) {
    if (model.isNew())
      return false
    this.sessionStorage().removeItem(this.name+"-"+model.id);
    this.records = _.reject(this.records, function(id){
      return id === model.id.toString();
    });
    this.save();
    return model;
  },

  sessionStorage: function() {
    return sessionStorage;
  },

  // fix for "illegal access" error on Android when JSON.parse is passed null
  jsonData: function (data) {
      return data && JSON.parse(data);
  }

});

// sessionSync delegate to the model or collection's
// *sessionStorage* property, which should be an instance of `Store`.
// window.Store.sync and Backbone.sessionSync is deprectated, use Backbone.SessionStorage.sync instead
Backbone.SessionStorage.sync = window.Store.sync = Backbone.sessionSync = function(method, model, options) {
  var store = model.sessionStorage || model.collection.sessionStorage;

  var resp, errorMessage, syncDfd = $.Deferred && $.Deferred(); //If $ is having Deferred - use it.

  try {

    switch (method) {
      case "read":
        resp = model.id != undefined ? store.find(model) : store.findAll();
        break;
      case "create":
        resp = store.create(model);
        break;
      case "update":
        resp = store.update(model);
        break;
      case "delete":
        resp = store.destroy(model);
        break;
    }

  } catch(error) {
    if (error.code === DOMException.QUOTA_EXCEEDED_ERR && window.sessionStorage.length === 0)
      errorMessage = "Private browsing is unsupported";
    else
      errorMessage = error.message;
  }

  if (resp) {
    model.trigger("sync", model, resp, options);
    if (options && options.success)
      options.success(resp);
    if (syncDfd)
      syncDfd.resolve(resp);

  } else {
    errorMessage = errorMessage ? errorMessage
                                : "Record Not Found";

    if (options && options.error)
      options.error(errorMessage);
    if (syncDfd)
      syncDfd.reject(errorMessage);
  }

  // add compatibility with $.ajax
  // always execute callback for success and error
  if (options && options.complete) options.complete(resp);

  return syncDfd && syncDfd.promise();
};

Backbone.ajaxSync = Backbone.sync;

Backbone.getSyncMethod = function(model) {
  if(model.sessionStorage || (model.collection && model.collection.sessionStorage)) {
    return Backbone.sessionSync;
  }

  return Backbone.ajaxSync;
};

// Override 'Backbone.sync' to default to sessionSync,
// the original 'Backbone.sync' is still available in 'Backbone.ajaxSync'
Backbone.sync = function(method, model, options) {
  return Backbone.getSyncMethod(model).apply(this, [method, model, options]);
};

return Backbone.SessionStorage;
}));
