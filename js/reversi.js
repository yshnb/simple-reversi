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
    passTimes: 0,
    strategy: {
      exec: function(cells) {
        return Cells.findWhere(cells.shift());
      }
    },
    initialize: function() {
      this.listenTo(this, 'startup', this.startGame);
      this.listenTo(this, 'reset', this.resetGame);
    },
    startGame: function() {
      this.setup();
      this.playing = true;
      this.listenTo(this, 'turnout', this.toggleTurn);
    },
    resetGame: function() {
      this.playing = false;
      this.turn = true;
      this.stopListening(this, 'turnout', this.toggleTurn);
      this.setup();
    },
    explore: function() {
      var self = this;
      _.each(Cells.where({exist: true, colored: !self.turn}), function(piece) {
        squareExplore(function(dx, dy) {
          var neighbor = Cells.findWhere({x: (piece.get("x") + dx), y: (piece.get("y") + dy)});
          if (neighbor !== undefined && !neighbor.get("exist") && (neighbor.check(function() {}) > 0)) self.setValidCell(neighbor);
        });
      });
      if (self.validCells.length > 0) {
        this.passFree();
        if (!this.turn) setTimeout(function() {self.placing.call(self); }, 50);
      } else {
        this.pass();
      }
    },
    toggleTurn: function() {
       this.turn = !this.turn;
       this.clearValidCell();
       this.explore();
       return this;
    },
    placing: function() {
      this.strategy.exec(this.validCells).placing(false);
    },
    setup: function() {
      _.each(_.range(1, 9), function(y) {
        _.each(_.range(1, 9), function(x) {
          if (Cells.where({x : x, y: y}).length === 0) Cells.create({x: x, y: y});
          else Cells.findWhere({x: x, y: y}).clean();
        });
      });
      _.each([{x: 4, y: 4}, {x: 4, y: 5}, {x: 5, y: 4}, {x: 5, y: 5}], function(cond) {
        Cells.findWhere(cond).placing(Boolean((cond.x + cond.y) % 2), true);
      });
      return this;
    },
    getSituation: function() {
      var black = this.playing ? Cells.where({exist: true, colored: true}).length : '-'
        , white = this.playing ? Cells.where({exist: true, colored: false}).length : '-';
      return { black: black, white: white };
    },
    pass: function() {
      if (Cells.hasEmpty() && ++this.passTimes < 2) this.toggleTurn();
      return this.passTimes;
    },
    passFree: function() {
      this.passTimes = 0;
    },
    setValidCell: function(cell) {
      this.validCells.push({x: cell.get("x"), y: cell.get("y") });
    },
    clearValidCell: function() {
      this.validCells = [];
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
      this.listenTo(this, 'check', this.check);
    },
    placing: function(colored, force) {
      var self = this;
      if (force || !this.get("exist") && this.check(function() {}) > 0) {
        self.save({exist: true, colored: colored}, {
          success: function() {
            self.check();
            Reversi.passFree();
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
      return this;
    },
    clean: function() {
      this.save({exist: false, colored: null});
      return this;
    },
    check: function(callback) {
      var self = this
        , count_piece = 0;
      squareExplore(function(dx, dy) {
        count_piece += self.checkCell(self.get("x"), self.get("y"), dx, dy, callback);
      });
      return count_piece;
    },
    checkCell: function(x, y, dx, dy, callback) {
      if (callback === undefined) callback = this.reverse;
      var neighbor = Cells.findWhere({x: (x + dx), y: (y + dy)})
        , piece = 0;
      if (typeof neighbor === 'object' && neighbor.get("exist")) {
        if (neighbor.get("colored") == (this.get("colored") === null ? Reversi.turn : this.get("colored"))) {
          return 0;
        } else if ((piece = this.checkCell(x + dx, y + dy, dx, dy, callback)) !== false) {
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
    hasEmpty: function() {
      return this.where({exist: false}).length > 0;
    }
  });

  var CellView = Backbone.View.extend({
    tagName: "td",
    events: {
      "click" : "onClick",
      "mouseover" : "onOver",
      "mouseout" : "onOut"
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
    onClick: function() {
      if (Reversi.playing && Reversi.turn) this.model.placing(Reversi.turn);
      return this;
    },
    onOver: function() {
      if (Reversi.playing && this.model.check(function() {}) > 0) this.$el.addClass('hover');
      else this.$el.removeClass('hover');
    },
    onOut: function() {
      this.$el.removeClass('hover');
    }
  });

  var TableView = Backbone.View.extend({
    el: "#reversi-board",
    rows: {},
    initialize: function() {
      this.listenTo(Cells, 'add', this.render);
      Cells.fetch();
      Reversi.trigger('setup');
    },
    render: function(cell) {
      var view = new CellView({model: cell})
        , y = cell.get('y');
      if (!_.has(this.rows, y)) {
        this.rows[y] = $('<tr />');
        this.$el.append(this.rows[y]);
      }
      this.rows[y].append(view.$el);
      return this;
    },
  });
  
  var ManipulationView = Backbone.View.extend({
    el: "#manipulationPanel",
    events: {
      "click #gameStartButton" : 'startUp',
      "click #resetButton" : 'reset'
    },
    initialize: function() {
      this.play(false);
    },
    startUp: function() {
      this.play(true);
    },
    reset: function() {
      this.play(false);
    },
    play: function(stat) {
      Reversi.trigger(stat ? 'startup' : 'reset');
      this.$el.find('#resetButton').prop('disabled', !stat);
      this.$el.find('#gameStartButton').prop('disabled', stat);
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
  var ManipulationPanel = new ManipulationView;
  var ScoreBoard = new ScoreView;

  var RandomStrategy = {
    exec: function(cells) {
      for (var i = 0; i < (Math.floor(Math.random() * cells.length)); i++) cells.push(cells.shift());
      return Cells.findWhere(cells.shift());
    }
  };
  var FirstMaxStrategy = {
    exec: function(cells) {
      var max = 0
        , maxCell;
      _.each(cells, function(cell) {
        if (Cells.findWhere(cell).check(function() {}) > max) {
          max = Cells.findWhere(cell).check(function() {});
          maxCell = cell;
        }
      });
      return Cells.findWhere(maxCell);
    }
  };
  Reversi.setStrategy(FirstMaxStrategy);

});
