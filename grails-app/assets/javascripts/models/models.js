(function () {
'use string'
angular.module('ticTacApp.models', ['awesomeResources'])
    .factory('Board', ['$resource', function ($resource) {
        return $resource({
            url: '/foo/bar', //Not binded to an endpoint yet
            methods: {
                initBoard: function () {
                    var self = this;
                    self.board = [];
                    _(3).range().each(function (idx) {
                        self.board[idx] = [];
                        _(3).range().each(function (index) {
                            // We might have to define the Cell  model at some point
                            self.board[idx].push({
                                style: 'empty'
                            });
                        })
                    });
                },
                gameOver: function (lastCellMoved) {
                    return this.finished = false;
                }
            }
        });
    }])
    .factory('Player', ['$resource', function ($resource) {
        return $resource({
            url: '/foo/bar' //Not binded to an endpoint yet
        });
    }]);
}());