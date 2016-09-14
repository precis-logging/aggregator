Precis Aggregator
=================

Performs running aggregations on flowing log data and stores it to a data store for retrieval and usage by the data frontends.


Defining Aggregates
---

Aggregates are built up out of two main parts; the stats (or what you want to collect) and the filter (or what records you want to collect from).

Before we get into this in more detail lets take a look at a complete Aggregate that you might have defined in a system.

###Full Monty

This is an over the top aggregation rule.  It collects a bunch of metrics from a very narrow set of records.  In this example logs are recorded with a data member.  The data member is an array of values.

```js
{
  "$filter": {
    "data.Method": "GET",
    "data": "Inbound completed: ",
    "data.Request": {
      "$exists": true
    },
    "data.URL": {
      "$regex": "^/redir/external"
    }
  },
  "stats": {
    "field": "data.duration",
    "aggregate": [
      "min",
      "max",
      "sum",
      "count",
      {
        "name": "qa",
        "$calc": "(c, v, $)=>$.data[1].Request&&$.data[1].Request.Headers['x-is-qa']?(c||0)+1:c||0"
      },
      {
        "name": "qa-student",
        "$calc": "(c, v, $)=>$.data[1].Request&&$.data[1].Request.Headers['x-is-qa']&&($.data[1].Request.Headers['x-role']==='student')?(c||0)+1:c||0"
      },
      {
        "name": "qa-instructor",
        "$calc": "(c, v, $)=>$.data[1].Request&&$.data[1].Request.Headers['x-is-qa']&&($.data[1].Request.Headers['x-role']==='instructor')?(c||0)+1:c||0"
      },
      {
        "name": "student",
        "$calc": "(c, v, $)=>$.data[1].Request&&(!$.data[1].Request.Headers['x-is-qa'])&&($.data[1].Request.Headers['x-role']==='student')?(c||0)+1:c||0"
      },
      {
        "name": "instructor",
        "$calc": "(c, v, $)=>$.data[1].Request&&(!$.data[1].Request.Headers['x-is-qa'])&&($.data[1].Request.Headers['x-role']==='instructor')?(c||0)+1:c||0"
      },
      {
        "name": "slow",
        "$calc": "(c, v, $)=>$.data[1].duration>1000?(c||0)+1:c||0"
      },
      {
        "name": "very-slow",
        "$calc": "(c, v, $)=>$.data[1].duration>10000?(c||0)+1:c||0"
      }
    ]
  }
}
```

####$Filter
First up is the filter:

```js
"$filter": {
  "data.Method": "GET",
  "data": "Inbound completed: ",
  "data.Request": {
    "$exists": true
  },
  "data.URL": {
    "$regex": "^/redir/external"
  }
},
```

The filter is a Sift.js JSON object that is used to determine if a record meets the conditions to be considered part of the Aggregate.  In this case we are looking for records with;

  * a data.Method member of "GET"
  * one of the data members to be a string with the value "Inbound completed: "
  * one of the data members to be an Object with a sub member of Request
  * one of the data members to have a URL member that is a string and begins with /redir/external

If a record does not meet all of the above then it will be skipped over by the Aggregator for this rule.  If it does meet all of the requirements setup by the filter then the record will be processed and the stats collected.

####stats

Let's reduce down the stats block a bit as there is some duplication of logic that once explained should make sense across all the other parts.  Here is what we will review

```js
"stats": {
  "field": "data.duration",
  "aggregate": [
    "min",
    "max",
    "sum",
    "count",
    {
      "name": "qa",
      "$calc": "(c, v, $)=>$.data[1].Request&&$.data[1].Request.Headers['x-is-qa']?(c||0)+1:c||0"
    },
  ]
}
```

First up is "field" this defines what field in the record we will be calculating all of our stats from.  In this case we want to work with the records data.duration field.  Usually "field" will be some type of numeric value, but you could aggregate strings or any other value as well with custom logic.

The comes "aggregate" this defines the metrics to record.  Precis Aggregator comes with a few built in aggregates:

  * min - Tracks the minimum value found in the field within the duration
  * max - Tracks the largest value found in the field within the duration
  * sum - Tracks the total value of the field over the duration
  * count - Tracks the count of the number of records processed

**NOTE:** Instead of tracking average track the sum and count values, the average can then be calculated from these two values.

Finally a custom metric is defined.  In this case its called "qa":

```js
{
  "name": "qa",
  "$calc": "(c, v, $)=>$.data[1].Request&&$.data[1].Request.Headers['x-is-qa']?(c||0)+1:c||0"
},
```

We give the metric a name "qa" and then we define how that metric is calculated using the $calc member.  The calculation is defined in something that resembles ES6 fat arrow functions and receives 3 parameters; the current accumulated value (c), the current field value (v), and the log record ($).

The function that is defined checks to see if the log record has a data[1].Request.Headers['x-is-qa'] value and if it does then it increments the value of c (or a default value of 0) and returns it.  If this value does not exist then it simply returns the value of c or 0.  The or return 0 is basically a way to initialize the default value of c.

For more complex methods you can also wrap the code in {}.  So it could have been written (using ES6 long strings for readability here) as:

```js
{
  "name": "qa",
  "$calc": `(c, v, $)=>{
    c = c || 0; // initialize c
    // Check if the header exists
    if($.data[1].Request&&$.data[1].Request.Headers['x-is-qa']){
      // Increment and return c
      return c+1;
    }
    // Just return c
    return c;
  }`
},
```
