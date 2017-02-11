import _ from 'lodash';
import $ from 'jquery';
import { batchActions } from 'redux-batched-actions';
import getNewSeries from 'Utilities/Series/getNewSeries';
import * as types from './actionTypes';
import { set, updateItem, removeItem } from './baseActions';
import { startLookupSeries } from './importSeriesActions';

const section = 'importSeries';
let concurrentLookups = 0;

const importSeriesActionHandlers = {
  [types.QUEUE_LOOKUP_SERIES]: function(payload) {
    return function(dispatch, getState) {
      const {
        name,
        path,
        term
      } = payload;

      const state = getState().importSeries;
      const item = _.find(state.items, { id: name }) || {
        id: name,
        term,
        path,
        isFetching: false,
        isPopulated: false,
        error: null
      };

      dispatch(updateItem({
        section,
        ...item,
        term,
        queued: true,
        items: []
      }));

      if (term && term.length > 2) {
        dispatch(startLookupSeries());
      }
    };
  },

  [types.START_LOOKUP_SERIES]: function(payload) {
    return function(dispatch, getState) {
      if (concurrentLookups >= 1) {
        return;
      }

      const state = getState().importSeries;
      const queued = _.find(state.items, { queued: true });

      if (!queued) {
        return;
      }

      concurrentLookups++;

      dispatch(updateItem({
        section,
        id: queued.id,
        isFetching: true
      }));

      const promise = $.ajax({
        url: '/series/lookup',
        data: {
          term: queued.term
        }
      });

      promise.done((data) => {
        dispatch(updateItem({
          section,
          id: queued.id,
          isFetching: false,
          isPopulated: true,
          error: null,
          items: data,
          queued: false,
          selectedSeries: queued.selectedSeries || data[0]
        }));
      });

      promise.fail((xhr) => {
        dispatch(updateItem({
          section,
          id: queued.id,
          isFetching: false,
          isPopulated: false,
          error: xhr,
          queued: false
        }));
      });

      promise.always(() => {
        concurrentLookups--;
        dispatch(startLookupSeries());
      });
    };
  },

  [types.IMPORT_SERIES]: function(payload) {
    return function(dispatch, getState) {
      dispatch(set({ section, isImporting: true }));

      const ids = payload.ids;
      const items = getState().importSeries.items;

      ids.forEach((id) => {
        const item = _.find(items, { id });
        const selectedSeries = item.selectedSeries;

        if (selectedSeries) {
          const newSeries = getNewSeries(_.cloneDeep(selectedSeries), item);
          newSeries.path = item.path;

          const promise = $.ajax({
            url: '/series',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(newSeries)
          });

          promise.done((data) => {
            dispatch(batchActions([
              updateItem({ section: 'series', ...data }),
              removeItem({ section, id })
            ]));
          });

          promise.fail((xhr) => {
            dispatch(updateItem({
              section,
              id,
              importError: xhr
            }));
          });
        }
      });

      dispatch(set({
        section,
        isImporting: false,
        isImported: true
      }));
    };
  }
};

export default importSeriesActionHandlers;