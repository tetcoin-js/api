// Copyright 2017-2019 @polkadot/api-derive authors & contributors
// This software may be modified and distributed under the terms
// of the Apache-2.0 license. See the LICENSE file for details.

import { AccountId, Balance, BlockNumber, SetIndex, VoteIndex } from '@polkadot/types/interfaces';
import { ITuple } from '@polkadot/types/types';

import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiInterfaceRx } from '@polkadot/api/types';
import { createType, Vec, u32 } from '@polkadot/types';

import { DerivedElectionsInfo } from '../types';
import { memo } from '../util';

type ResultElectionsInner = [u32, u32, Vec<ITuple<[AccountId, BlockNumber]>>, SetIndex, BlockNumber, VoteIndex, SetIndex];
type ResultElections = [Vec<AccountId>, ResultElectionsInner];

function deriveElections (api: ApiInterfaceRx, [candidates, [candidateCount, desiredSeats, members, nextVoterSet, termDuration, voteCount, voterCount]]: ResultElections): DerivedElectionsInfo {
  return {
    candidates,
    candidateCount,
    desiredSeats,
    nextVoterSet,
    members: members.map(([accountId]): [AccountId, Balance] => [accountId, createType(api.registry, 'Balance')]),
    runnersUp: [],
    termDuration,
    voteCount,
    voterCount
  };
}

function queryElections (api: ApiInterfaceRx): Observable<DerivedElectionsInfo> {
  // NOTE We have an issue where candidates can return `null` for an empty array
  return combineLatest([
    api.query.elections.candidates<Vec<AccountId>>(),
    api.queryMulti<ResultElectionsInner>([
      api.query.elections.candidateCount,
      api.query.elections.desiredSeats,
      api.query.elections.members,
      api.query.elections.nextVoterSet,
      api.query.elections.termDuration,
      api.query.elections.voteCount,
      api.query.elections.voterCount
    ])
  ]).pipe(map((result): DerivedElectionsInfo => deriveElections(api, result)));
}

function derivePhragmen (api: ApiInterfaceRx, candidates: AccountId[], members: [AccountId, Balance][], runnersUp: [AccountId, Balance][], candidacyBond: Balance, desiredSeats: u32, termDuration: BlockNumber, votingBond: Balance): DerivedElectionsInfo {
  return {
    candidates,
    candidateCount: createType(api.registry, 'u32', candidates.length),
    candidacyBond,
    desiredSeats,
    members: members.sort((a, b): number => b[1].cmp(a[1])),
    runnersUp: runnersUp.sort((a, b): number => b[1].cmp(a[1])),
    termDuration,
    votingBond
  };
}

function queryPhragmen (api: ApiInterfaceRx): Observable<DerivedElectionsInfo> {
  // NOTE We have an issue where candidates can return `null` for an empty array, hence
  // we are not using multi queries here, so empty array is empty (instead of space-filled)
  return combineLatest([
    api.query.electionsPhragmen.candidates<Vec<AccountId>>(),
    api.query.electionsPhragmen.members<Vec<ITuple<[AccountId, Balance]>>>(),
    api.query.electionsPhragmen.runnersUp<Vec<ITuple<[AccountId, Balance]>>>()
  ]).pipe(
    map(([candidates, members, runnersUp]): DerivedElectionsInfo => derivePhragmen(
      api,
      candidates,
      members,
      runnersUp,
      api.consts.electionsPhragmen.candidacyBond as Balance,
      api.consts.electionsPhragmen.desiredMembers as u32,
      api.consts.electionsPhragmen.termDuration as BlockNumber,
      api.consts.electionsPhragmen.votingBond as Balance
    ))
  );
}

/**
 * @name info
 * @returns An object containing the combined results of the storage queries for
 * all relevant election module properties.
 * @example
 * <BR>
 *
 * ```javascript
 * api.derive.elections.info(({ members, candidates }) => {
 *   console.log(`There are currently ${members.length} council members and ${candidates.length} prospective council candidates.`);
 * });
 * ```
 */
export function info (api: ApiInterfaceRx): () => Observable<DerivedElectionsInfo> {
  return memo((): Observable<DerivedElectionsInfo> =>
    api.query.electionsPhragmen
      ? queryPhragmen(api)
      : queryElections(api)
  );
}
