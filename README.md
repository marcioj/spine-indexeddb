# spine-indexed-db

Spine indexeddb is a simple api to provide persistence using the indexeddb.
For usage just make any model extend the Spine.Model.IndexedDb module. As followed:

```
User = Spine.Model.sub();
User.configure('User','name','age','email');
User.extend(Spine.Model.IndexedDb);
```

By default, it will create a connection called `default` and an objectStore with the same name like the model name, in the previous example will be called `User`.
To change the default just configure the `User.dbMetadata` object.
