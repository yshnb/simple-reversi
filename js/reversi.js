$(function() {
  var squareExplore = function(callback) {
    _.each(_.range(-1, 2), function(dx) {
      _.each(_.range(-1, 2), function(dy) {
        if (dx !== 0 || dy !== 0) callback(dx, dy);
      });
    });
  };

  var ReversiEngine = Backbone.Model.extend({
    validCells: [],
    playing: false,
    turn: true,
    strategy: {
      exec: function(cells) {
        return Cells.findWhere(cells.shift());
      }
    },
    initialize: function() {
      this.listenTo(this, 'startup', function() {
        this.playing = true;
        this.listenTo(this, 'turnout', this.turnOut);
      });
      this.listenTo(this, 'reset', function() {
        this.playing = false;
        this.stopListening(this, 'turnout', this.turnOut);
      });
    },
    explore: function() {
      var self = this;
      _.each(Cells.where({exist: true, colored: !self.turn}), function(piece) {
        squareExplore(function(dx, dy) {
          var neighbor = Cells.findWhere({x: (piece.get("x") + dx), y: (piece.get("y") + dy)});
          if (neighbor !== undefined && !neighbor.get("exist") && (neighbor.cascade(function() {}) > 0)) self.addValidCell(neighbor);
        });
      });
      if (self.validCells.length > 0) {
        if (!self.turn) setTimeout(function() {self.placing.call(self); }, 50);
      } else {
        self.turnOut();
      }
    },
    turnOut: function() {
       this.turn = !this.turn;
       this.explore();
       return this;
    },
    addValidCell: function(cell) {
      this.validCells.push({x: cell.get("x"), y: cell.get("y") });
    },
    placing: function() {
      this.strategy.exec(this.validCells).placing(false);
      this.validCells =[];
    },
    getSituation: function() {
      var black = this.playing ? Cells.where({ exist: true, colored: true }).length : '-'
      , white = this.playing ? Cells.where({ exist: true, colored: false }).length : '-'
      ;
      return { black: black, white: white };
    },
    setStrategy: function(strategy) {
      this.strategy = strategy;
      return this;
    }
  });
  var Reversi = new ReversiEngine;

  var Cell = Backbone.Model.extend({
    defaults: function() {
      return {
        exist: false,
        colored: null,
        x: false,
        y: false
      };
    },
    initialize: function() {
      this.listenTo(this, 'cascade', this.cascade);
    },
    validate: function(attrs) {
      var count_reverse = this.cascade(function() {});
      if (!count_reverse) return false;
    },
    placing: function(colored, force) {
      var self = this;
      if (force || !this.get("exist") && this.cascade(function() {}) > 0) {
        self.save({exist: true, colored: colored}, {
          success: function() {
            self.cascade();
            Reversi.trigger('turnout');
          },
          error: function(e) {
            console.log(e);
          }
        });
      }
      return this;
    },
    reverse: function() {
      this.save({colored: !this.get("colored")});
    },
    clean: function() {
      this.save({exist: false, colored: null});
    },
    cascade: function(callback) {
      var self = this
        , count_piece = 0;
      squareExplore(function(dx, dy) {
        count_piece += self.explore(self.get("x"), self.get("y"), dx, dy, callback);
      });
      return count_piece;
    },
    explore: function(x, y, dx, dy, callback) {
      if (callback === undefined) callback = this.reverse;
      var neighbor = Cells.findWhere({x: (x + dx), y: (y + dy)})
        , piece = 0;
      if (typeof neighbor === 'object' && neighbor.get("exist")) {
        if (neighbor.get("colored") == (this.get("colored") === null ? Reversi.turn : this.get("colored"))) {
          return 0;
        } else if ((piece = this.explore(x + dx, y + dy, dx, dy, callback)) !== false) {
          callback.call(neighbor);
          return ++piece;
        }
      }
      return false;
    }
  });

  var CellsList = Backbone.Collection.extend({
    model: Cell,
    sessionStorage: new Backbone.SessionStorage("reversi-backbone"),
    setup: function() {
      var self = this;
      _.each(_.range(1, 9), function(y) {
        _.each(_.range(1, 9), function(x) {
          if (self.where({x : x, y: y}).length === 0) self.create({x: x, y: y});
          else self.findWhere({x: x, y: y}).clean();
        });
      });
      this.findWhere({x: 4, y: 5}).placing(true, true);
      this.findWhere({x: 5, y: 4}).placing(true, true);
      this.findWhere({x: 4, y: 4}).placing(false, true);
      this.findWhere({x: 5, y: 5}).placing(false, true);
      return this;
    }
  });

  var CellView = Backbone.View.extend({
    tagName: "td",
    events: {
      "click" : "cellOnClick"
    },
    initialize: function() {
      this.listenTo(this.model, 'change', this.render);
    },
    render: function() {
      if (this.model.get("exist")) {
        if (this.model.get('colored')) this.$el.removeClass('colored-false').addClass('colored-true');
        else this.$el.removeClass('colored-true').addClass('colored-false');
      } else {
        this.$el.removeClass('colored-true colored-false');
      }
      return this;
    },
    cellOnClick: function() {
      if (Reversi.playing && Reversi.turn) this.model.placing(Reversi.turn);
      return this;
    }
  });

  var TableView = Backbone.View.extend({
    el: "#reversi-board",
    initialize: function() {
      this.listenTo(Cells, 'add', this.render);
      Cells.fetch();　
      Cells.setup();　
    },
    render: function(cell) {
      var view = new CellView({model: cell});
      var y = cell.get('y');
      if (!_.has(this.rows, y)) {
        this.rows[y] = $('<tr />');
        this.$el.append(this.rows[y]);
      }
      this.rows[y].append(view.$el);
      return this;
    },
    rows: {}
  });
  
  var ManipulationView = Backbone.View.extend({
    el: "#manipulationPanel",
    events: {
      "click #gameStartButton" : 'startUp',
      "click #resetButton" : 'reset'
    },
    startUp: function() {
      Cells.setup();　
      Reversi.trigger('startup');
    },
    reset: function() {
      Reversi.trigger('reset');
      Cells.setup();　
    }
  });
  
  var ScoreView = Backbone.View.extend({
    el: "#scoreBoard",
    initialize: function() {
      this.listenTo(Reversi, 'startup', this.render);
      this.listenTo(Reversi, 'turnout', this.render);
      this.listenTo(Reversi, 'reset', this.render);
    },
    render: function() {
      var score = Reversi.getSituation();
      this.$el.find('#situationBlack').text(score.black);
      this.$el.find('#situationWhite').text(score.white);
    }
  });

  var Cells = new CellsList;
  var Table = new TableView;
  var Manipulation = new ManipulationView;
  var Score = new ScoreView;

  var RandomStrategy = {
      exec: function(cells) {
        for (var i = 0; i < (Math.floor(Math.random() * 64)); i++) cells.push(cells.shift());
        return Cells.findWhere(cells.shift());
      }
  };
  Reversi.setStrategy(RandomStrategy);

});
