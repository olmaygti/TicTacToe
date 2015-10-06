(function () {
'use string'
angular.module('ticTacApp.models', ['awesomeResources'])
    .factory('Board', ['$resource', function ($resource) {
        // "private methods"
        /**
         *  Iterates the board through a given axis axys. For the give to have finished
         *  the moving player must have all the cells of that row/column with this style
         *  It's assuming the corrent binding of the "this" context is done
         *
         * @param {number} The coordinate of the last movement in the given axys
         * @param {string} The style of the player that just moved (circle/cross)
         * @param {boolean} Wheter if this call should check columns or rows
         *
         * @return {boolean} Whether if the game is finished or not
         */
        function checkCartesians (coordinate, style, xAxys) {
            for (var counter = 0; counter < this.board.length; counter++) {
                var row = xAxys ? coordinate : counter,
                    column = xAxys ? counter : coordinate;
                if (this.board[row][column].style !== style) {
                    return false;
                }
            }
            return true;
        }

        /**
         *  Iterates the board throug both diagonals to check if the game hsa finished
         *  It's assuming the corrent binding of the "this" context is done
         *
         * @param {string} The style of the player that just moved (circle/cross)
         *
         * @return {boolean} Whether if the game is finished or not
         */
        function checkDiagonals (style) {
            var diagonalMatched = true;

            for (var counter = 0; counter < this.board.length; counter ++) {
                if (this.board[counter][counter].style !== style) {
                    diagonalMatched = false;
                    break;
                }
            }

            if (!diagonalMatched) {
                diagonalMatched = true;
                for (var x = 0, y = this.board.length -1; x < this.board.length ; x++, y--) {
                    if (this.board[x][y].style !== style) {
                        diagonalMatched = false;
                        break;
                    }
                }
            }

            return diagonalMatched;
        }

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
                                x: idx,
                                y: index,
                                style: 'empty'
                            });
                        })
                    });
                },
                gameOver: function (lastCellMoved) {
                    var styleToCheck = lastCellMoved.player.style,
                        gameOver = checkCartesians.call(this, lastCellMoved.x, styleToCheck, true);

                    gameOver = gameOver || checkCartesians.call(this, lastCellMoved.y, styleToCheck, false);

                    return this.finished = gameOver || checkDiagonals.call(this, styleToCheck);
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
