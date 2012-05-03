(function() {

    if (typeof Spine === "undefined" || Spine === null) Spine = require('spine');

    if ('webkitIndexedDB' in window) {
        window.indexedDB = window.webkitIndexedDB;
        window.IDBTransaction = window.webkitIDBTransaction;
    } else if ('mozIndexedDB' in window) {
        window.indexedDB = window.mozIndexedDB;
    }

    function DefaultMigration(db,versionChangeEvent) {
        db.createObjectStore(this.dbMetadata.objectStoreName,{ keyPath: this.dbMetadata.primaryKey, autoIncrement: this.dbMetadata.autoIncrement });
    }

    function DbMetadata(options) {
        this.name = options.name;
        this.version = options.version;
        this.primaryKey = options.primaryKey;
        this.autoIncrement = options.autoIncrement;
        this.objectStoreName = options.objectStoreName;
        // version : migration function
        this.migrations = {
            1 : DefaultMigration
        };
    }

    function doMigration(modelContext,db,versionChangeEvent) {
        var migration = modelContext.dbMetadata.migrations[db.version];
        migration && migration.call(modelContext,db,versionChangeEvent);
    }

    var Base = {

        extended: function() {
            // the default dbMetadata
            this.dbMetadata = new DbMetadata({ name: 'default', version: 1, primaryKey: 'id', autoIncrement : true, objectStoreName : this.className });
        },

        connect: function(callback) {

            var dbRequest = window.indexedDB.open(this.dbMetadata.name,this.dbMetadata.version)
            var that = this;
            dbRequest.onsuccess = function(e) {
                var db = this.result;
                // rack for onupgradeneeded for webkit implementations
                if (parseFloat(db.version) !== that.dbMetadata.version) {
                    var versionRequest = db.setVersion(that.dbMetadata.version);
                    versionRequest.onsuccess = function(e) {
                        //TODO webkit doesn't have IDBVersionChangeEvent mock it or wait the implementation?
                        doMigration(that,db,null);
                        // processs just after migration call
                        callback.call(that,db);
                        db.close();
                    }
                }
                else {
                    // process normally
                    callback.call(that,db);
                    db.close();
                }
            }

            dbRequest.onupgradeneeded = function(evt) {
                doMigration(that,this.result,evt);
            }

            dbRequest.onerror = function() {
                console.log('Error while creating dbRequest');
            }

        }

    }

    var Collection = {

        fetch: function() {

            this.connect(function(db) {

                var objectStore = db.transaction(this.dbMetadata.objectStoreName).objectStore(this.dbMetadata.objectStoreName);
                var that = this;

                // use the optimized form provided by gecko
                if (objectStore.getAll) {
                    objectStore.getAll().onsuccess = function(event) {
                        that.refresh(this.result);
                        console.log('Fetched all data');
                    }
                }
                else {
                    objectStore.openCursor().onsuccess = function(event) {
                        var cursor = event.target.result;
                        if (cursor) {
                            that.refresh(cursor.value);
                            cursor.continue();
                        }
                        else {
                            console.log('Fetched all data');
                        }
                    }
                }

            })

        }

    }

    var Singleton = {

        create: function(object) {

            this.connect(function(db) {

                var transaction = db.transaction(this.dbMetadata.objectStoreName,IDBTransaction.READ_WRITE);
                transaction.oncomplete = function() {
                    console.log('Transaction complete');
                }

                var store = transaction.objectStore(this.dbMetadata.objectStoreName);

                var oldId = object.__proto__.id;

                // forces the id to be an autoincrement
                if (this.dbMetadata.autoIncrement) {
                    delete object.__proto__.id;
                }
                // spined put the data on __proto__ but objectStore do not save the data on prototype chain
                var writeRequest = store.add(object.__proto__);

                writeRequest.onsuccess = function (e) {
                    if (oldId !== e.target.result) {
                        var id = e.target.result;
                        var records = object.constructor.records;
                        records[id] = records[oldId];
                        delete records[oldId];
                    }
                    console.log('Data created');
                };

                writeRequest.onerror = function(e) {
                    console.log("Error while creating");
                }

            })

        },

        destroy: function(object) {

            this.connect(function(db) {

                // obs tem que parsear a string para int para funcionar
                var request = db.transaction(this.dbMetadata.objectStoreName, IDBTransaction.READ_WRITE)
                    .objectStore(this.dbMetadata.objectStoreName)
                    .delete(object.id);

                request.onsuccess = function(event) {
                    console.log('Data removed');
                };

                request.onerror = function() {
                    console.log("Error while removing");
                }

            })

        },

        update: function(object) {

            this.connect(function(db) {

                var transaction = db.transaction(this.dbMetadata.objectStoreName,IDBTransaction.READ_WRITE);
                transaction.oncomplete = function() {
                    console.log('Transaction complete');
                }

                var store = transaction.objectStore(this.dbMetadata.objectStoreName);
                // spined put the data on __proto__ but objectStore do not save the data on prototype chain
                var writeRequest = store.put(object.__proto__);

                writeRequest.onsuccess = function (e) {
                    console.log('Data updated');
                };

                writeRequest.onerror = function(e) {
                    console.log("Error while updating");
                }

            })

        }

    }

    Spine.Model.IndexedDb = {

        extended: function() {
            this.extend(Base);
            this.change(this.indexedDbChange);
            this.fetch(Collection.fetch);
        },

        indexedDbChange: function(record, type, options) {
            Singleton[type].call(this,record);
        }

    };

    // expose methods for external usage
    Spine.Model.IndexedDb.Base = Base;
    Spine.Model.IndexedDb.Collection = Collection;
    Spine.Model.IndexedDb.Singleton = Singleton;

})()